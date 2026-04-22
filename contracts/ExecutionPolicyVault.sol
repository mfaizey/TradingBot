// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract ExecutionPolicyVault {
    address public owner;
    address public executor;
    bool public paused;
    uint256 public maxTradeSize;

    mapping(address => bool) public tokenWhitelist;
    mapping(address => bool) public tokenBlacklist;

    event ExecutorUpdated(address indexed executor);
    event PauseStateChanged(bool paused);
    event MaxTradeSizeUpdated(uint256 maxTradeSize);
    event TokenPermissionsUpdated(address indexed token, bool whitelisted, bool blacklisted);
    event TradeExecuted(address indexed target, address indexed tokenIn, address indexed tokenOut, uint256 amountIn);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "only executor");
        _;
    }

    constructor(address initialExecutor, uint256 initialMaxTradeSize) {
        owner = msg.sender;
        executor = initialExecutor;
        maxTradeSize = initialMaxTradeSize;
    }

    function setExecutor(address newExecutor) external onlyOwner {
        executor = newExecutor;
        emit ExecutorUpdated(newExecutor);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseStateChanged(value);
    }

    function setMaxTradeSize(uint256 value) external onlyOwner {
        maxTradeSize = value;
        emit MaxTradeSizeUpdated(value);
    }

    function setTokenPermissions(address token, bool whitelisted, bool blacklisted) external onlyOwner {
        tokenWhitelist[token] = whitelisted;
        tokenBlacklist[token] = blacklisted;
        emit TokenPermissionsUpdated(token, whitelisted, blacklisted);
    }

    function approveSpender(address token, address spender, uint256 amount) external onlyOwner {
        require(IERC20(token).approve(spender, amount), "approve failed");
    }

    function execute(
        address target,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata callData
    ) external onlyExecutor returns (bytes memory result) {
        require(!paused, "paused");
        require(tokenWhitelist[tokenIn] && tokenWhitelist[tokenOut], "token not whitelisted");
        require(!tokenBlacklist[tokenIn] && !tokenBlacklist[tokenOut], "token blacklisted");
        require(amountIn <= maxTradeSize, "trade too large");

        (bool success, bytes memory response) = target.call(callData);
        require(success, "execution failed");

        emit TradeExecuted(target, tokenIn, tokenOut, amountIn);
        return response;
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(to, amount), "transfer failed");
    }
}
