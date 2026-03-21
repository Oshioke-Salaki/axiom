// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IReputationSystem.sol";

/**
 * @title CovenantProtocol
 * @notice The heart of AXIOM. AI agents make cryptographically binding promises
 *         to each other. Every covenant has three phases:
 *
 *         1. CREATION   — Requester deposits payment into escrow
 *         2. COMMITMENT — Provider commits a hash of their reasoning BEFORE acting
 *                          (stored on Filecoin, immutable, tamper-proof)
 *         3. FULFILLMENT — Provider reveals reasoning + deliverable CID
 *                           Escrow releases to provider automatically
 *
 *         If the deadline passes without fulfillment, escrow returns to requester
 *         and provider's reputation is penalized.
 *
 *         This is the first time AI agents can be HELD ACCOUNTABLE to each other.
 */
contract CovenantProtocol {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum CovenantState {
        OPEN,       // Created, awaiting provider commitment
        COMMITTED,  // Provider committed reasoning hash
        FULFILLED,  // Provider delivered, payment released
        BREACHED,   // Deadline passed, requester refunded
        CANCELLED   // Cancelled before commitment
    }

    struct Covenant {
        uint256 id;
        address requester;          // Agent that created the covenant
        address provider;           // Agent that accepted it
        string termsHash;           // Hash of the terms (stored on Filecoin)
        string termsCID;            // Filecoin CID of full terms document
        uint256 paymentAmount;      // ETH locked in escrow
        uint256 deadline;           // Unix timestamp
        CovenantState state;
        // Commit-reveal phase
        bytes32 reasoningCommitment; // keccak256(reasoning) committed before execution
        string reasoningCID;         // Filecoin CID revealed after execution
        string deliverableCID;       // Filecoin CID of the work product
        uint256 createdAt;
        uint256 committedAt;
        uint256 fulfilledAt;
        // Delegation
        bytes delegationData;        // MetaMask delegation caveat data (optional)
        uint256 minReputationRequired; // Provider must meet this threshold
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    uint256 public covenantCount;
    mapping(uint256 => Covenant) public covenants;
    mapping(address => uint256[]) public requesterCovenants;
    mapping(address => uint256[]) public providerCovenants;

    IReputationSystem public reputationSystem;
    address public agentRegistry;
    address public owner;

    uint256 public constant MIN_DEADLINE_BUFFER = 60;  // 60 seconds minimum
    uint256 public protocolFeesBps = 50;               // 0.5% fee
    address public feeRecipient;
    uint256 public totalFeesCollected;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event CovenantCreated(
        uint256 indexed id,
        address indexed requester,
        address indexed provider,
        uint256 paymentAmount,
        uint256 deadline,
        string termsCID
    );

    event ReasoningCommitted(
        uint256 indexed id,
        address indexed provider,
        bytes32 reasoningCommitment,
        uint256 timestamp
    );

    event CovenantFulfilled(
        uint256 indexed id,
        address indexed provider,
        string reasoningCID,
        string deliverableCID,
        uint256 paymentReleased,
        uint256 timestamp
    );

    event CovenantBreached(
        uint256 indexed id,
        address indexed provider,
        uint256 refundAmount,
        uint256 timestamp
    );

    event CovenantCancelled(uint256 indexed id, uint256 timestamp);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "CovenantProtocol: not owner");
        _;
    }

    modifier covenantExists(uint256 id) {
        require(id < covenantCount, "CovenantProtocol: covenant does not exist");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _reputationSystem, address _agentRegistry) {
        owner = msg.sender;
        feeRecipient = msg.sender;
        reputationSystem = IReputationSystem(_reputationSystem);
        agentRegistry = _agentRegistry;
    }

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    function setProtocolFee(uint256 bps) external onlyOwner {
        require(bps <= 500, "CovenantProtocol: fee too high"); // Max 5%
        protocolFeesBps = bps;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        feeRecipient = recipient;
    }

    // -------------------------------------------------------------------------
    // Phase 1: Create Covenant
    // -------------------------------------------------------------------------

    /**
     * @notice Create a covenant and lock payment into escrow.
     * @param provider               Address of the agent being hired.
     * @param termsCID               Filecoin CID of the full terms document.
     * @param termsHash              Hash of the terms for quick verification.
     * @param deadline               Unix timestamp by which work must be done.
     * @param minReputationRequired  Minimum reputation score for the provider.
     * @param delegationData         Optional MetaMask delegation caveat bytes.
     */
    function createCovenant(
        address provider,
        string calldata termsCID,
        string calldata termsHash,
        uint256 deadline,
        uint256 minReputationRequired,
        bytes calldata delegationData
    ) external payable returns (uint256 covenantId) {
        require(msg.value > 0, "CovenantProtocol: payment required");
        require(provider != address(0), "CovenantProtocol: invalid provider");
        require(provider != msg.sender, "CovenantProtocol: cannot covenant with self");
        require(
            deadline >= block.timestamp + MIN_DEADLINE_BUFFER,
            "CovenantProtocol: deadline too soon"
        );
        require(bytes(termsCID).length > 0, "CovenantProtocol: terms CID required");

        // Check provider meets reputation threshold
        if (minReputationRequired > 0 && address(reputationSystem) != address(0)) {
            uint256 providerScore = reputationSystem.getScore(provider);
            require(
                providerScore >= minReputationRequired,
                "CovenantProtocol: provider reputation insufficient"
            );
        }

        covenantId = covenantCount++;

        covenants[covenantId] = Covenant({
            id: covenantId,
            requester: msg.sender,
            provider: provider,
            termsHash: termsHash,
            termsCID: termsCID,
            paymentAmount: msg.value,
            deadline: deadline,
            state: CovenantState.OPEN,
            reasoningCommitment: bytes32(0),
            reasoningCID: "",
            deliverableCID: "",
            createdAt: block.timestamp,
            committedAt: 0,
            fulfilledAt: 0,
            delegationData: delegationData,
            minReputationRequired: minReputationRequired
        });

        requesterCovenants[msg.sender].push(covenantId);
        providerCovenants[provider].push(covenantId);

        emit CovenantCreated(
            covenantId,
            msg.sender,
            provider,
            msg.value,
            deadline,
            termsCID
        );
    }

    // -------------------------------------------------------------------------
    // Phase 2: Commit Reasoning (BEFORE acting)
    // -------------------------------------------------------------------------

    /**
     * @notice Provider commits a hash of their reasoning BEFORE executing any action.
     *         This is the tamper-proof record. Once committed, the reasoning cannot
     *         be changed retroactively. Stored on Filecoin for permanent auditability.
     *
     * @param id                 Covenant ID.
     * @param reasoningCommitment  keccak256(reasoning || salt) — hash of pre-action reasoning.
     */
    function commitReasoning(
        uint256 id,
        bytes32 reasoningCommitment
    ) external covenantExists(id) {
        Covenant storage covenant = covenants[id];
        require(covenant.provider == msg.sender, "CovenantProtocol: not the provider");
        require(covenant.state == CovenantState.OPEN, "CovenantProtocol: invalid state");
        require(block.timestamp < covenant.deadline, "CovenantProtocol: deadline passed");
        require(reasoningCommitment != bytes32(0), "CovenantProtocol: invalid commitment");

        covenant.reasoningCommitment = reasoningCommitment;
        covenant.state = CovenantState.COMMITTED;
        covenant.committedAt = block.timestamp;

        emit ReasoningCommitted(id, msg.sender, reasoningCommitment, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // Phase 3: Fulfill Covenant
    // -------------------------------------------------------------------------

    /**
     * @notice Provider reveals their reasoning and delivers the work.
     *         The on-chain hash is verified against the revealed reasoning.
     *         If valid, payment is released automatically.
     *
     * @param id              Covenant ID.
     * @param reasoning       The full reasoning text (must match committed hash).
     * @param salt            Salt used in the commitment hash.
     * @param reasoningCID    Filecoin CID of the full reasoning document.
     * @param deliverableCID  Filecoin CID of the work product/deliverable.
     */
    function fulfillCovenant(
        uint256 id,
        string calldata reasoning,
        bytes32 salt,
        string calldata reasoningCID,
        string calldata deliverableCID
    ) external covenantExists(id) {
        Covenant storage covenant = covenants[id];
        require(covenant.provider == msg.sender, "CovenantProtocol: not the provider");
        require(covenant.state == CovenantState.COMMITTED, "CovenantProtocol: must commit first");
        require(block.timestamp < covenant.deadline, "CovenantProtocol: deadline passed");
        require(bytes(deliverableCID).length > 0, "CovenantProtocol: deliverable required");

        // Verify the reasoning matches the commitment
        bytes32 expectedCommitment = keccak256(abi.encodePacked(reasoning, salt));
        require(
            expectedCommitment == covenant.reasoningCommitment,
            "CovenantProtocol: reasoning does not match commitment"
        );

        covenant.state = CovenantState.FULFILLED;
        covenant.reasoningCID = reasoningCID;
        covenant.deliverableCID = deliverableCID;
        covenant.fulfilledAt = block.timestamp;

        // Update reputation
        if (address(reputationSystem) != address(0)) {
            reputationSystem.recordFulfillment(covenant.provider);
        }

        // Calculate and collect protocol fee
        uint256 fee = (covenant.paymentAmount * protocolFeesBps) / 10000;
        uint256 providerPayment = covenant.paymentAmount - fee;
        totalFeesCollected += fee;

        // Release payment to provider
        (bool providerPaid, ) = payable(covenant.provider).call{value: providerPayment}("");
        require(providerPaid, "CovenantProtocol: payment to provider failed");

        if (fee > 0) {
            (bool feePaid, ) = payable(feeRecipient).call{value: fee}("");
            require(feePaid, "CovenantProtocol: fee transfer failed");
        }

        emit CovenantFulfilled(
            id,
            msg.sender,
            reasoningCID,
            deliverableCID,
            providerPayment,
            block.timestamp
        );
    }

    // -------------------------------------------------------------------------
    // Breach / Cancel
    // -------------------------------------------------------------------------

    /**
     * @notice Anyone can call this after deadline to trigger a breach.
     *         Provider's reputation is penalized, requester is refunded.
     */
    function triggerBreach(uint256 id) external covenantExists(id) {
        Covenant storage covenant = covenants[id];
        require(
            covenant.state == CovenantState.OPEN || covenant.state == CovenantState.COMMITTED,
            "CovenantProtocol: covenant already resolved"
        );
        require(block.timestamp >= covenant.deadline, "CovenantProtocol: deadline not reached");

        covenant.state = CovenantState.BREACHED;

        // Penalize reputation
        if (address(reputationSystem) != address(0)) {
            reputationSystem.recordBreach(covenant.provider);
        }

        // Refund requester
        uint256 refund = covenant.paymentAmount;
        (bool refunded, ) = payable(covenant.requester).call{value: refund}("");
        require(refunded, "CovenantProtocol: refund failed");

        emit CovenantBreached(id, covenant.provider, refund, block.timestamp);
    }

    /**
     * @notice Requester can cancel a covenant before the provider commits.
     */
    function cancel(uint256 id) external covenantExists(id) {
        Covenant storage covenant = covenants[id];
        require(covenant.requester == msg.sender, "CovenantProtocol: not the requester");
        require(covenant.state == CovenantState.OPEN, "CovenantProtocol: can only cancel OPEN covenants");

        covenant.state = CovenantState.CANCELLED;

        (bool refunded, ) = payable(covenant.requester).call{value: covenant.paymentAmount}("");
        require(refunded, "CovenantProtocol: refund failed");

        emit CovenantCancelled(id, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getCovenant(uint256 id) external view returns (Covenant memory) {
        return covenants[id];
    }

    function getRequesterCovenants(address requester) external view returns (uint256[] memory) {
        return requesterCovenants[requester];
    }

    function getProviderCovenants(address provider) external view returns (uint256[] memory) {
        return providerCovenants[provider];
    }

    function isExpired(uint256 id) external view returns (bool) {
        return block.timestamp >= covenants[id].deadline;
    }

    function getStateString(uint256 id) external view returns (string memory) {
        CovenantState state = covenants[id].state;
        if (state == CovenantState.OPEN) return "OPEN";
        if (state == CovenantState.COMMITTED) return "COMMITTED";
        if (state == CovenantState.FULFILLED) return "FULFILLED";
        if (state == CovenantState.BREACHED) return "BREACHED";
        if (state == CovenantState.CANCELLED) return "CANCELLED";
        return "UNKNOWN";
    }

    receive() external payable {}
}
