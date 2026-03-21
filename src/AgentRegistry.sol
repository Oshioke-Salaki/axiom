// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IReputationSystem.sol";

/**
 * @title AgentRegistry
 * @notice First-class onchain registry for AXIOM agents.
 *         Every agent anchors its identity to an immutable Filecoin constitution CID.
 *         Agents cannot act without a registered identity — this is the trust root.
 */
contract AgentRegistry {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct AgentProfile {
        address owner;          // EOA or smart account that controls this agent
        string constitutionCID; // Filecoin CID of the agent's constitution
        string name;            // Human-readable agent name
        string agentType;       // e.g. "sentiment", "trading", "orchestrator"
        uint256 registeredAt;
        bool active;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => AgentProfile) public agents;
    mapping(address => bool) public isRegistered;
    address[] public agentAddresses;

    IReputationSystem public reputationSystem;
    address public covenantProtocol;
    address public owner;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AgentRegistered(
        address indexed agentAddress,
        string name,
        string agentType,
        string constitutionCID,
        uint256 timestamp
    );

    event ConstitutionUpdated(
        address indexed agentAddress,
        string oldCID,
        string newCID,
        uint256 timestamp
    );

    event AgentDeactivated(address indexed agentAddress, uint256 timestamp);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyRegistered(address agentAddr) {
        require(isRegistered[agentAddr], "AgentRegistry: agent not registered");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "AgentRegistry: not owner");
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

    function setReputationSystem(address _reputationSystem) external onlyOwner {
        reputationSystem = IReputationSystem(_reputationSystem);
    }

    function setCovenantProtocol(address _covenantProtocol) external onlyOwner {
        covenantProtocol = _covenantProtocol;
    }

    // -------------------------------------------------------------------------
    // Core Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Register an AI agent with a Filecoin-backed constitution.
     * @param agentAddress  The address this agent will transact from.
     * @param name          Human-readable name.
     * @param agentType     Category (e.g. "sentiment", "executor", "orchestrator").
     * @param constitutionCID  Filecoin/IPFS CID of the agent's constitution JSON.
     */
    function register(
        address agentAddress,
        string calldata name,
        string calldata agentType,
        string calldata constitutionCID
    ) external {
        require(!isRegistered[agentAddress], "AgentRegistry: already registered");
        require(bytes(constitutionCID).length > 0, "AgentRegistry: constitution CID required");
        require(bytes(name).length > 0, "AgentRegistry: name required");

        agents[agentAddress] = AgentProfile({
            owner: msg.sender,
            constitutionCID: constitutionCID,
            name: name,
            agentType: agentType,
            registeredAt: block.timestamp,
            active: true
        });

        isRegistered[agentAddress] = true;
        agentAddresses.push(agentAddress);

        // Bootstrap reputation score
        if (address(reputationSystem) != address(0)) {
            reputationSystem.initializeAgent(agentAddress);
        }

        emit AgentRegistered(agentAddress, name, agentType, constitutionCID, block.timestamp);
    }

    /**
     * @notice Update the agent's constitution (e.g. new capabilities, updated rules).
     *         The old constitution remains on Filecoin forever — full audit trail.
     */
    function updateConstitution(
        address agentAddress,
        string calldata newCID
    ) external onlyRegistered(agentAddress) {
        require(
            msg.sender == agents[agentAddress].owner || msg.sender == agentAddress,
            "AgentRegistry: unauthorized"
        );
        require(bytes(newCID).length > 0, "AgentRegistry: CID required");

        string memory oldCID = agents[agentAddress].constitutionCID;
        agents[agentAddress].constitutionCID = newCID;

        emit ConstitutionUpdated(agentAddress, oldCID, newCID, block.timestamp);
    }

    /**
     * @notice Deactivate an agent — it can no longer enter covenants.
     */
    function deactivate(address agentAddress) external onlyRegistered(agentAddress) {
        require(
            msg.sender == agents[agentAddress].owner || msg.sender == agentAddress,
            "AgentRegistry: unauthorized"
        );
        agents[agentAddress].active = false;
        emit AgentDeactivated(agentAddress, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function getAgent(address agentAddress)
        external
        view
        returns (AgentProfile memory)
    {
        return agents[agentAddress];
    }

    function isActive(address agentAddress) external view returns (bool) {
        return isRegistered[agentAddress] && agents[agentAddress].active;
    }

    function totalAgents() external view returns (uint256) {
        return agentAddresses.length;
    }

    function getAllAgents() external view returns (address[] memory) {
        return agentAddresses;
    }
}
