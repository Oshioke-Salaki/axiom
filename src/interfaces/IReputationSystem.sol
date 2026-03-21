// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReputationSystem {
    function initializeAgent(address agent) external;
    function recordFulfillment(address agent) external;
    function recordBreach(address agent) external;
    function getScore(address agent) external view returns (uint256);
    function getTier(address agent) external view returns (string memory);
}
