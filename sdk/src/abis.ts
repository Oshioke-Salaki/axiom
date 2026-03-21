export const AGENT_REGISTRY_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "agentAddress", "type": "address" },
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "string", "name": "agentType", "type": "string" },
      { "internalType": "string", "name": "constitutionCID", "type": "string" }
    ],
    "name": "register",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "agentAddress", "type": "address" }],
    "name": "getAgent",
    "outputs": [
      {
        "components": [
          { "internalType": "address", "name": "owner", "type": "address" },
          { "internalType": "string", "name": "constitutionCID", "type": "string" },
          { "internalType": "string", "name": "name", "type": "string" },
          { "internalType": "string", "name": "agentType", "type": "string" },
          { "internalType": "uint256", "name": "registeredAt", "type": "uint256" },
          { "internalType": "bool", "name": "active", "type": "bool" }
        ],
        "internalType": "struct AgentRegistry.AgentProfile",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "agentAddress", "type": "address" }],
    "name": "isRegistered",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "agentAddress", "type": "address" }],
    "name": "isActive",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAgents",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getAllAgents",
    "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "agentAddress", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "name", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "agentType", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "constitutionCID", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "AgentRegistered",
    "type": "event"
  }
] as const;

export const COVENANT_PROTOCOL_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "provider", "type": "address" },
      { "internalType": "string", "name": "termsCID", "type": "string" },
      { "internalType": "string", "name": "termsHash", "type": "string" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" },
      { "internalType": "uint256", "name": "minReputationRequired", "type": "uint256" },
      { "internalType": "bytes", "name": "delegationData", "type": "bytes" }
    ],
    "name": "createCovenant",
    "outputs": [{ "internalType": "uint256", "name": "covenantId", "type": "uint256" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" },
      { "internalType": "bytes32", "name": "reasoningCommitment", "type": "bytes32" }
    ],
    "name": "commitReasoning",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" },
      { "internalType": "string", "name": "reasoning", "type": "string" },
      { "internalType": "bytes32", "name": "salt", "type": "bytes32" },
      { "internalType": "string", "name": "reasoningCID", "type": "string" },
      { "internalType": "string", "name": "deliverableCID", "type": "string" }
    ],
    "name": "fulfillCovenant",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "triggerBreach",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "cancel",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "getCovenant",
    "outputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "id", "type": "uint256" },
          { "internalType": "address", "name": "requester", "type": "address" },
          { "internalType": "address", "name": "provider", "type": "address" },
          { "internalType": "string", "name": "termsHash", "type": "string" },
          { "internalType": "string", "name": "termsCID", "type": "string" },
          { "internalType": "uint256", "name": "paymentAmount", "type": "uint256" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" },
          { "internalType": "uint8", "name": "state", "type": "uint8" },
          { "internalType": "bytes32", "name": "reasoningCommitment", "type": "bytes32" },
          { "internalType": "string", "name": "reasoningCID", "type": "string" },
          { "internalType": "string", "name": "deliverableCID", "type": "string" },
          { "internalType": "uint256", "name": "createdAt", "type": "uint256" },
          { "internalType": "uint256", "name": "committedAt", "type": "uint256" },
          { "internalType": "uint256", "name": "fulfilledAt", "type": "uint256" },
          { "internalType": "bytes", "name": "delegationData", "type": "bytes" },
          { "internalType": "uint256", "name": "minReputationRequired", "type": "uint256" }
        ],
        "internalType": "struct CovenantProtocol.Covenant",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "provider", "type": "address" }],
    "name": "getProviderCovenants",
    "outputs": [{ "internalType": "uint256[]", "name": "", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "covenantCount",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "requester", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "provider", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "paymentAmount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "deadline", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "termsCID", "type": "string" }
    ],
    "name": "CovenantCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "provider", "type": "address" },
      { "indexed": false, "internalType": "bytes32", "name": "reasoningCommitment", "type": "bytes32" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "ReasoningCommitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "provider", "type": "address" },
      { "indexed": false, "internalType": "string", "name": "reasoningCID", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "deliverableCID", "type": "string" },
      { "indexed": false, "internalType": "uint256", "name": "paymentReleased", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "CovenantFulfilled",
    "type": "event"
  }
] as const;

export const REPUTATION_SYSTEM_ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "agent", "type": "address" }],
    "name": "getScore",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "agent", "type": "address" }],
    "name": "getTier",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "agent", "type": "address" }],
    "name": "getRecord",
    "outputs": [
      {
        "components": [
          { "internalType": "uint256", "name": "score", "type": "uint256" },
          { "internalType": "uint256", "name": "totalCovenants", "type": "uint256" },
          { "internalType": "uint256", "name": "fulfilled", "type": "uint256" },
          { "internalType": "uint256", "name": "breached", "type": "uint256" },
          { "internalType": "uint256", "name": "lastUpdated", "type": "uint256" },
          { "internalType": "string[]", "name": "executionLogCIDs", "type": "string[]" }
        ],
        "internalType": "struct ReputationSystem.ReputationRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "agent", "type": "address" }],
    "name": "getSuccessRate",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "agent", "type": "address" }],
    "name": "getExecutionLogs",
    "outputs": [{ "internalType": "string[]", "name": "", "type": "string[]" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
