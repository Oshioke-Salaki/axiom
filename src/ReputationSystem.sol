// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IReputationSystem.sol";

/**
 * @title ReputationSystem
 * @notice Tamper-resistant reputation scores for AXIOM agents.
 *         Scores are computed from on-chain covenant history.
 *         All execution logs are anchored to Filecoin CIDs stored via CovenantProtocol.
 *
 *         Tiers:
 *           0-199   → "Untrusted"
 *           200-499 → "Provisional"
 *           500-749 → "Established"
 *           750-899 → "Trusted"
 *           900+    → "Elite"
 */
contract ReputationSystem is IReputationSystem {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant INITIAL_SCORE = 300;
    uint256 public constant FULFILLMENT_REWARD = 25;
    uint256 public constant BREACH_PENALTY = 75;
    uint256 public constant MAX_SCORE = 1000;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct ReputationRecord {
        uint256 score;
        uint256 totalCovenants;
        uint256 fulfilled;
        uint256 breached;
        uint256 lastUpdated;
        string[] executionLogCIDs; // Filecoin CIDs of execution proofs
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => ReputationRecord) public records;
    mapping(address => bool) public initialized;

    address public covenantProtocol;
    address public agentRegistry;
    address public owner;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ReputationInitialized(address indexed agent, uint256 initialScore);
    event ReputationUpdated(address indexed agent, uint256 oldScore, uint256 newScore, bool positive);
    event ExecutionLogAnchored(address indexed agent, string cid, uint256 timestamp);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAuthorized() {
        require(
            msg.sender == covenantProtocol || msg.sender == agentRegistry || msg.sender == owner,
            "ReputationSystem: unauthorized"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "ReputationSystem: not owner");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() {
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    function setCovenantProtocol(address _covenantProtocol) external onlyOwner {
        covenantProtocol = _covenantProtocol;
    }

    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        agentRegistry = _agentRegistry;
    }

    // -------------------------------------------------------------------------
    // Core Functions
    // -------------------------------------------------------------------------

    function initializeAgent(address agent) external override onlyAuthorized {
        require(!initialized[agent], "ReputationSystem: already initialized");
        records[agent] = ReputationRecord({
            score: INITIAL_SCORE,
            totalCovenants: 0,
            fulfilled: 0,
            breached: 0,
            lastUpdated: block.timestamp,
            executionLogCIDs: new string[](0)
        });
        initialized[agent] = true;
        emit ReputationInitialized(agent, INITIAL_SCORE);
    }

    function recordFulfillment(address agent) external override onlyAuthorized {
        require(initialized[agent], "ReputationSystem: agent not initialized");
        ReputationRecord storage record = records[agent];

        uint256 oldScore = record.score;
        uint256 newScore = oldScore + FULFILLMENT_REWARD;
        if (newScore > MAX_SCORE) newScore = MAX_SCORE;

        record.score = newScore;
        record.totalCovenants++;
        record.fulfilled++;
        record.lastUpdated = block.timestamp;

        emit ReputationUpdated(agent, oldScore, newScore, true);
    }

    function recordBreach(address agent) external override onlyAuthorized {
        require(initialized[agent], "ReputationSystem: agent not initialized");
        ReputationRecord storage record = records[agent];

        uint256 oldScore = record.score;
        uint256 newScore = oldScore > BREACH_PENALTY ? oldScore - BREACH_PENALTY : 0;

        record.score = newScore;
        record.totalCovenants++;
        record.breached++;
        record.lastUpdated = block.timestamp;

        emit ReputationUpdated(agent, oldScore, newScore, false);
    }

    /**
     * @notice Anchor a Filecoin CID of an execution log to an agent's record.
     *         This creates a permanent, verifiable trail of the agent's reasoning.
     */
    function anchorExecutionLog(address agent, string calldata cid) external onlyAuthorized {
        require(initialized[agent], "ReputationSystem: agent not initialized");
        records[agent].executionLogCIDs.push(cid);
        emit ExecutionLogAnchored(agent, cid, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getScore(address agent) external view override returns (uint256) {
        if (!initialized[agent]) return 0;
        return records[agent].score;
    }

    function getTier(address agent) external view override returns (string memory) {
        if (!initialized[agent]) return "Unregistered";
        uint256 score = records[agent].score;
        if (score >= 900) return "Elite";
        if (score >= 750) return "Trusted";
        if (score >= 500) return "Established";
        if (score >= 200) return "Provisional";
        return "Untrusted";
    }

    function getRecord(address agent) external view returns (ReputationRecord memory) {
        return records[agent];
    }

    function getExecutionLogs(address agent) external view returns (string[] memory) {
        return records[agent].executionLogCIDs;
    }

    function getSuccessRate(address agent) external view returns (uint256) {
        ReputationRecord storage record = records[agent];
        if (record.totalCovenants == 0) return 0;
        return (record.fulfilled * 100) / record.totalCovenants;
    }
}
