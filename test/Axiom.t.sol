// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";
import "../src/ReputationSystem.sol";
import "../src/CovenantProtocol.sol";

contract AxiomTest is Test {
    AgentRegistry public registry;
    ReputationSystem public reputation;
    CovenantProtocol public covenant;

    address public deployer = address(0x1);
    address public masterAgent = address(0x2);
    address public sentimentAgent = address(0x3);
    address public requester = address(0x4);

    function setUp() public {
        vm.startPrank(deployer);

        reputation = new ReputationSystem();
        registry = new AgentRegistry();
        covenant = new CovenantProtocol(address(reputation), address(registry));

        reputation.setCovenantProtocol(address(covenant));
        reputation.setAgentRegistry(address(registry));
        registry.setReputationSystem(address(reputation));
        registry.setCovenantProtocol(address(covenant));

        vm.stopPrank();

        // Fund agents
        vm.deal(masterAgent, 10 ether);
        vm.deal(sentimentAgent, 1 ether);
        vm.deal(requester, 10 ether);
    }

    // -------------------------------------------------------------------------
    // Agent Registry Tests
    // -------------------------------------------------------------------------

    function test_RegisterAgent() public {
        vm.prank(masterAgent);
        registry.register(
            masterAgent,
            "MasterOrchestrator",
            "orchestrator",
            "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
        );

        assertTrue(registry.isRegistered(masterAgent));
        AgentRegistry.AgentProfile memory profile = registry.getAgent(masterAgent);
        assertEq(profile.name, "MasterOrchestrator");
        assertEq(profile.agentType, "orchestrator");
        assertEq(reputation.getScore(masterAgent), 300); // Initial score
    }

    function test_RevertRegisterDuplicate() public {
        vm.startPrank(masterAgent);
        registry.register(masterAgent, "Master", "orchestrator", "bafytest1");
        vm.expectRevert("AgentRegistry: already registered");
        registry.register(masterAgent, "Master2", "orchestrator", "bafytest2");
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Covenant Full Lifecycle Tests
    // -------------------------------------------------------------------------

    function test_FullCovenantLifecycle() public {
        // Register both agents
        vm.prank(masterAgent);
        registry.register(masterAgent, "Master", "orchestrator", "bafymaster");

        vm.prank(sentimentAgent);
        registry.register(sentimentAgent, "SentimentAgent", "sentiment", "bafysentiment");

        // Master creates covenant with 0.01 ETH
        uint256 deadline = block.timestamp + 3600;
        vm.prank(masterAgent);
        uint256 covenantId = covenant.createCovenant{value: 0.01 ether}(
            sentimentAgent,
            "bafyterms123",
            "0xabc",
            deadline,
            0,
            ""
        );

        assertEq(covenantId, 0);
        CovenantProtocol.Covenant memory c = covenant.getCovenant(0);
        assertEq(c.paymentAmount, 0.01 ether);
        assertEq(uint(c.state), uint(CovenantProtocol.CovenantState.OPEN));

        // SentimentAgent commits reasoning BEFORE acting
        string memory reasoning = "I analyzed BTC sentiment: 73% positive signals from Farcaster";
        bytes32 salt = keccak256("secret-salt-123");
        bytes32 commitment = keccak256(abi.encodePacked(reasoning, salt));

        vm.prank(sentimentAgent);
        covenant.commitReasoning(0, commitment);

        c = covenant.getCovenant(0);
        assertEq(uint(c.state), uint(CovenantProtocol.CovenantState.COMMITTED));
        assertEq(c.reasoningCommitment, commitment);

        // SentimentAgent fulfills: reveals reasoning + delivers work
        uint256 providerBalanceBefore = sentimentAgent.balance;

        vm.prank(sentimentAgent);
        covenant.fulfillCovenant(
            0,
            reasoning,
            salt,
            "bafyreasoning456",   // Filecoin CID of reasoning doc
            "bafydeliverable789"   // Filecoin CID of work product
        );

        c = covenant.getCovenant(0);
        assertEq(uint(c.state), uint(CovenantProtocol.CovenantState.FULFILLED));

        // Provider got paid (minus 0.5% fee)
        uint256 fee = (0.01 ether * 50) / 10000;
        assertEq(sentimentAgent.balance, providerBalanceBefore + 0.01 ether - fee);

        // Reputation was rewarded
        assertEq(reputation.getScore(sentimentAgent), 300 + 25); // INITIAL + FULFILLMENT_REWARD
    }

    function test_BreachCovenant() public {
        vm.prank(masterAgent);
        registry.register(masterAgent, "Master", "orchestrator", "bafymaster");
        vm.prank(sentimentAgent);
        registry.register(sentimentAgent, "Sentiment", "sentiment", "bafysentiment");

        uint256 deadline = block.timestamp + 100;

        vm.prank(masterAgent);
        covenant.createCovenant{value: 0.05 ether}(
            sentimentAgent,
            "bafyterms",
            "0xhash",
            deadline,
            0,
            ""
        );

        // Advance time past deadline
        vm.warp(block.timestamp + 200);

        uint256 requesterBalanceBefore = masterAgent.balance;

        // Anyone can trigger breach
        vm.prank(address(0x999));
        covenant.triggerBreach(0);

        CovenantProtocol.Covenant memory c = covenant.getCovenant(0);
        assertEq(uint(c.state), uint(CovenantProtocol.CovenantState.BREACHED));

        // Requester refunded
        assertEq(masterAgent.balance, requesterBalanceBefore + 0.05 ether);

        // Reputation penalized: 300 - 75 = 225
        assertEq(reputation.getScore(sentimentAgent), 225);
    }

    function test_ReputationTiers() public {
        vm.prank(masterAgent);
        registry.register(masterAgent, "Master", "orchestrator", "bafymaster");

        assertEq(reputation.getTier(masterAgent), "Provisional"); // Score 300

        // Simulate many fulfillments
        vm.startPrank(address(covenant));
        reputation.recordFulfillment(masterAgent); // 325
        reputation.recordFulfillment(masterAgent); // 350
        reputation.recordFulfillment(masterAgent); // 375
        reputation.recordFulfillment(masterAgent); // 400
        reputation.recordFulfillment(masterAgent); // 425
        reputation.recordFulfillment(masterAgent); // 450
        reputation.recordFulfillment(masterAgent); // 475
        reputation.recordFulfillment(masterAgent); // 500
        vm.stopPrank();

        assertEq(reputation.getTier(masterAgent), "Established"); // Score 500
    }

    function test_WrongReasoningRejected() public {
        vm.prank(masterAgent);
        registry.register(masterAgent, "Master", "orchestrator", "bafymaster");
        vm.prank(sentimentAgent);
        registry.register(sentimentAgent, "Sentiment", "sentiment", "bafysentiment");

        vm.prank(masterAgent);
        covenant.createCovenant{value: 0.01 ether}(
            sentimentAgent,
            "bafyterms",
            "0xhash",
            block.timestamp + 3600,
            0,
            ""
        );

        bytes32 salt = keccak256("salt");
        bytes32 commitment = keccak256(abi.encodePacked("real reasoning", salt));

        vm.prank(sentimentAgent);
        covenant.commitReasoning(0, commitment);

        // Try to reveal wrong reasoning
        vm.prank(sentimentAgent);
        vm.expectRevert("CovenantProtocol: reasoning does not match commitment");
        covenant.fulfillCovenant(0, "fake reasoning", salt, "bafyreasoning", "bafydeliverable");
    }

    function test_MinReputationEnforced() public {
        vm.prank(masterAgent);
        registry.register(masterAgent, "Master", "orchestrator", "bafymaster");
        vm.prank(sentimentAgent);
        registry.register(sentimentAgent, "Sentiment", "sentiment", "bafysentiment");

        // Require 500 reputation but sentiment agent only has 300
        vm.prank(masterAgent);
        vm.expectRevert("CovenantProtocol: provider reputation insufficient");
        covenant.createCovenant{value: 0.01 ether}(
            sentimentAgent,
            "bafyterms",
            "0xhash",
            block.timestamp + 3600,
            500, // min reputation required
            ""
        );
    }
}
