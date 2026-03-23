// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";
import "../src/ReputationSystem.sol";
import "../src/CovenantProtocol.sol";

contract DeployAxiom is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy ReputationSystem
        ReputationSystem reputation = new ReputationSystem();
        console.log("ReputationSystem deployed at:", address(reputation));

        // 2. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry deployed at:", address(registry));

        // 3. Deploy CovenantProtocol
        CovenantProtocol covenant = new CovenantProtocol(
            address(reputation),
            address(registry)
        );
        console.log("CovenantProtocol deployed at:", address(covenant));

        // 4. Wire them together
        reputation.setCovenantProtocol(address(covenant));
        reputation.setAgentRegistry(address(registry));
        registry.setReputationSystem(address(reputation));
        registry.setCovenantProtocol(address(covenant));

        console.log("\n=== AXIOM DEPLOYMENT COMPLETE ===");
        console.log("Network: Base Mainnet");
        console.log("AgentRegistry:    ", address(registry));
        console.log("ReputationSystem: ", address(reputation));
        console.log("CovenantProtocol: ", address(covenant));

        vm.stopBroadcast();
    }
}
