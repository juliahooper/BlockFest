// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BlockFest
 * @notice ERC-20-like ticket token with group escrow + refund management for BlockFest events.
 * @dev Inherits OpenZeppelin ReentrancyGuard for mutual exclusion on value-transferring methods.
 */
contract BlockFest is ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Number of decimal places for tickets (indivisible tickets, whole units only).
    uint8 public constant decimals = 0;

    /// @notice Token name for storefronts and wallets.
    string public constant name = "BlockFest Ticket";

    /// @notice Token symbol for wallets and explorers.
    string public constant symbol = "BFT";

    /// @notice Maximum number of members allowed per group.
    uint256 public constant MAX_GROUP_SIZE = 4;

    // ---------------------------------------------------------------------
    // Immutables
    // ---------------------------------------------------------------------

    /// @notice Price per ticket in wei (SETH).
    uint256 public immutable ticketPrice;

    /// @notice Address with administrative privileges.
    address public immutable owner;

    /// @notice Maximum number of tickets available for the event. Set at deployment and never changes.
    uint256 public immutable totalTickets;

    // ---------------------------------------------------------------------
    // ERC-20 storage
    // ---------------------------------------------------------------------

    /// @notice Total ticket supply in circulation.
    uint256 private _totalSupply;

    /// @notice Per-address ticket holdings.
    mapping(address => uint256) private _balances;

    /// @notice Allowance map for transferFrom approvals.
    mapping(address => mapping(address => uint256)) private _allowances;

    // ---------------------------------------------------------------------
    // Escrow accounting
    // ---------------------------------------------------------------------

    /// @notice Sum of SETH currently locked in active group escrow.
    uint256 private _totalEscrowLocked;

    /// @notice Sum of SETH waiting to be claimed from failed push refunds.
    uint256 private _totalUnclaimedRefunds;

    /// @notice Per-address unclaimed refund amount post-failed push refund.
    mapping(address => uint256) private _unclaimedRefunds;

    // ---------------------------------------------------------------------
    // Ticket availability tracking
    // ---------------------------------------------------------------------

    /// @notice Tickets currently held by active groups with at least one payment.
    /// Decremented when a group is cancelled (if at least one member paid) or when tickets are released to members.
    uint256 private _reservedTickets;

    /// @notice Tickets permanently transferred to completed group members.
    /// Decremented when a ticket is returned to the owner's pool.
    uint256 private _soldTickets;

    // ---------------------------------------------------------------------
    // Chain state
    // ---------------------------------------------------------------------

    /// @notice On-chain block data indexed by chain position. Position 0 is the genesis block.
    mapping(uint256 => TicketBlock) private _chain;

    /// @notice Total number of blocks in the chain including the genesis block.
    uint256 public chainLength;

    // ---------------------------------------------------------------------
    // Group state types
    // ---------------------------------------------------------------------

    /// @notice Group lifecycle states.
    enum GroupState { None, Active, Completed, Cancelled }

    /// @notice Per-wallet participation record for group membership and escrow holdings.
    struct Account {
        uint256 groupId;
        uint256 escrowBalance;
    }

    /// @notice Group record storing creator, deadline, paid count, and state.
    struct Group {
        address creator;
        uint256 deadline;
        uint256 paidCount;
        GroupState state;
    }

    /// @notice On-chain block representing a confirmed ticket group.
    /// @dev Each block cryptographically links to the previous block via previousHash,
    ///   creating a verifiable chain of confirmed ticket groups within the contract.
    struct TicketBlock {
        uint256 blockNumber;
        uint256 groupId;
        bytes32 previousHash;
        bytes32 blockHash;
        address[] members;
        uint256 timestamp;
        uint256 ticketCount;
    }

    // ---------------------------------------------------------------------
    // Mappings for groups and accounts
    // ---------------------------------------------------------------------

    /// @notice Activation state for each wallet in the ticketing flow.
    mapping(address => Account) private _accounts;

    /// @notice Group metadata by group id.
    mapping(uint256 => Group) private _groups;

    /// @notice Membership lists for each group id.
    mapping(uint256 => address[]) private _groupMembers;

    /// @notice Next group identifier; starts at 1 (0 means none).
    uint256 public nextGroupId;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted for ERC-20 ticket transfers.
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice Emitted for ERC-20 allowance approvals.
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Emitted when a new group is created.
    event GroupCreated(uint256 indexed groupId, address indexed creator, uint256 deadline, uint256 groupSize);

    /// @notice Emitted when a member joins a group and pays escrow.
    event MemberJoined(uint256 indexed groupId, address indexed member, uint256 paidCount);

    /// @notice Emitted when a group is successfully completed and tickets are released.
    event GroupCompleted(uint256 indexed groupId);

    /// @notice Emitted when a group is cancelled before deadline or by timeout.
    event GroupCancelled(uint256 indexed groupId, address indexed triggeredBy);

    /// @notice Emitted when a returned ticket is transferred back to the owner and the refund is executed.
    event TicketReturned(address indexed holder, uint256 refundAmount);

    /// @notice Emitted when an automatic refund fails and the amount is recorded.
    event RefundFailed(uint256 indexed groupId, address indexed member, uint256 amount);

    /// @notice Emitted when a user successfully claims a fallback refund.
    event RefundClaimed(address indexed claimant, uint256 amount);

    /// @notice Emitted when tickets are reserved for a group on the first member payment.
    event TicketsReserved(uint256 indexed groupId, uint256 ticketCount);

    /// @notice Emitted when a completed group is added as a new block to the on-chain chain.
    event BlockAdded(uint256 indexed blockNumber, uint256 indexed groupId, bytes32 blockHash);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @notice Restricts access to the contract owner.
    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner can call this");
        _;
    }

    /// @notice Restricts access to the group creator or contract owner.
    modifier onlyCreatorOrOwner(uint256 groupId) {
        require(msg.sender == _groups[groupId].creator || msg.sender == owner, "Only group creator or owner can call this");
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    /**
     * @notice Deploy the BlockFest ticket system with fixed ticket supply and pricing.
     * @param _ticketPrice Price per ticket in wei.
     * @param _totalTickets Total event capacity; all tickets minted to the owner at deployment.
     *   _totalTickets replaces the former _initialSupply parameter. The supply is fixed at
     *   deployment and never changes; _releaseTickets transfers from the owner pool rather
     *   than minting new tokens.
     */
    constructor(uint256 _ticketPrice, uint256 _totalTickets) {
        require(_ticketPrice > 0, "Ticket price must be greater than zero");
        require(_totalTickets > 0, "Initial supply must be greater than zero");

        owner = msg.sender;
        ticketPrice = _ticketPrice;
        totalTickets = _totalTickets;
        nextGroupId = 1;

        _totalSupply = _totalTickets;
        _balances[msg.sender] = _totalTickets;

        emit Transfer(address(0), msg.sender, _totalTickets);

        _chain[0] = TicketBlock({
            blockNumber: 0,
            groupId: 0,
            previousHash: bytes32(0),
            blockHash: keccak256(abi.encode("BlockFest Genesis")),
            members: new address[](0),
            timestamp: block.timestamp,
            ticketCount: 0
        });
        chainLength = 1;
    }

    // ---------------------------------------------------------------------
    // ERC-20 Functions
    // ---------------------------------------------------------------------

    /**
     * @notice Returns the total supply of tickets in circulation.
     * @return The total number of tickets minted.
     */
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Returns the ticket balance of a specific account.
     * @param account The address to query.
     * @return The number of tickets held by the account.
     */
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Returns the allowance granted by an owner to a spender.
     * @param tokenOwner The address granting the allowance.
     * @param spender The address allowed to spend on behalf of the owner.
     * @return The remaining allowance amount.
     */
    function allowance(address tokenOwner, address spender) external view returns (uint256) {
        return _allowances[tokenOwner][spender];
    }

    /**
     * @notice Approves a spender to transfer tickets on behalf of the caller.
     * @param spender The address to approve for spending.
     * @param amount The amount of tickets to approve.
     * @return True if the approval succeeds.
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        require(spender != address(0), "Approve to zero address not permitted");
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * @notice Transfers tickets from the caller to the owner only.
     * @dev Restricted to prevent ticket touting and scalping by limiting transfers to the vendor.
     * This ensures tickets remain controlled and can only be returned to the event organizer.
     * @param to The recipient address (must be the owner).
     * @param amount The number of tickets to transfer.
     * @return True if the transfer succeeds.
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        require(to == owner, "Tickets may only be transferred back to the vendor");
        require(amount > 0, "Transfer amount must be greater than zero");
        require(_balances[msg.sender] >= amount, "Insufficient ticket balance");

        _balances[msg.sender] -= amount;
        _balances[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * @notice Transfers tickets from a specified address to the owner using allowance.
     * @dev Restricted to prevent ticket touting and scalping by limiting transfers to the vendor.
     * This ensures tickets remain controlled and can only be returned to the event organizer.
     * @param from The address to transfer tickets from.
     * @param to The recipient address (must be the owner).
     * @param amount The number of tickets to transfer.
     * @return True if the transfer succeeds.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(to == owner, "Tickets may only be transferred back to the vendor");
        require(amount > 0, "Transfer amount must be greater than zero");
        require(_balances[from] >= amount, "Insufficient ticket balance");
        require(_allowances[from][msg.sender] >= amount, "Allowance insufficient for this transfer");

        _balances[from] -= amount;
        _balances[to] += amount;
        _allowances[from][msg.sender] -= amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // ---------------------------------------------------------------------
    // Group Management Functions
    // ---------------------------------------------------------------------

    /**
     * @notice Creates a new group for ticket purchase with specified members and deadline.
     * @param members Array of additional member addresses to include in the group.
     * @param deadlineHours Number of hours from now until the group deadline.
     */
    function createGroup(address[] memory members, uint256 deadlineHours) external {
        require(
            availableTickets() >= members.length + 1,
            "Not enough tickets available for this group size"
        );
        require(members.length + 1 <= MAX_GROUP_SIZE, "Group size exceeds maximum of 4 including creator");
        require(deadlineHours >= 1, "Deadline must be at least 1 hour");
        require(deadlineHours <= 168, "Deadline cannot exceed 168 hours");
        require(_accounts[msg.sender].groupId == 0, "You are already in an active group");
        require(_balances[msg.sender] == 0, "You already own a ticket");

        // Check for duplicates in members array
        for (uint256 i = 0; i < members.length; i++) {
            require(members[i] != address(0), "Member address cannot be zero address");
            require(members[i] != msg.sender, "Creator cannot add themselves as a member");
            require(_accounts[members[i]].groupId == 0, "A member is already in an active group");
            require(_balances[members[i]] == 0, "A member already owns a ticket");
            for (uint256 j = i + 1; j < members.length; j++) {
                require(members[i] != members[j], "Duplicate member address");
            }
        }

        // Create Group struct
        Group memory newGroup = Group({
            creator: msg.sender,
            deadline: block.timestamp + deadlineHours * 1 hours,
            paidCount: 0,
            state: GroupState.Active
        });

        // Store group
        _groups[nextGroupId] = newGroup;

        // Add creator to members
        _groupMembers[nextGroupId].push(msg.sender);
        _accounts[msg.sender].groupId = nextGroupId;

        // Add other members
        for (uint256 i = 0; i < members.length; i++) {
            _groupMembers[nextGroupId].push(members[i]);
            _accounts[members[i]].groupId = nextGroupId;
        }

        // Emit event
        emit GroupCreated(nextGroupId, msg.sender, newGroup.deadline, _groupMembers[nextGroupId].length);

        // Increment next group ID
        nextGroupId++;
    }

    /**
     * @notice Internal function to release tickets when a group is fully paid.
     * @dev Transfers tickets from the owner's pool to each member rather than minting,
     *   keeping total supply fixed. Updates reservation and sold counters, then appends
     *   the group as a new block to the on-chain chain.
     * @param groupId The ID of the group to release tickets for.
     */
    function _releaseTickets(uint256 groupId) internal {
        require(_groups[groupId].state == GroupState.Active, "Group is not active");
        require(_groups[groupId].paidCount == _groupMembers[groupId].length, "Group is not fully paid");

        _groups[groupId].state = GroupState.Completed;

        uint256 memberCount = _groupMembers[groupId].length;
        for (uint256 i = 0; i < memberCount; i++) {
            address member = _groupMembers[groupId][i];
            _balances[owner] -= 1;
            _balances[member] += 1;
            _totalEscrowLocked -= ticketPrice;
            _accounts[member].groupId = 0;
            _accounts[member].escrowBalance = 0;
            emit Transfer(owner, member, 1);
        }

        _reservedTickets -= memberCount;
        _soldTickets += memberCount;
        _addToChain(groupId, _groupMembers[groupId]);

        emit GroupCompleted(groupId);
    }

    /**
     * @notice Allows a group member to join by paying the ticket price in escrow.
     * @dev This function is nonReentrant to prevent reentrancy attacks, even though no ETH is sent out directly.
     * The function may call _releaseTickets internally if the group becomes fully paid, which modifies state and emits events.
     * Following Checks-Effects-Interactions: checks first, then state updates, then potential internal call.
     * On the first payment (paidCount goes from 0 to 1), tickets are reserved for the entire group
     * from the available pool. This is the authoritative availability guard.
     * @param groupId The ID of the group to join.
     */
    function joinGroup(uint256 groupId) external payable nonReentrant {
        // Checks
        require(groupId > 0 && groupId < nextGroupId, "Group does not exist");
        require(_groups[groupId].state == GroupState.Active, "Group is not active");
        require(block.timestamp < _groups[groupId].deadline, "Group deadline has already passed");
        require(msg.value == ticketPrice, "Must send exact ticket price in SETH");
        require(_accounts[msg.sender].groupId == groupId, "You are not a member of this group");
        require(_accounts[msg.sender].escrowBalance == 0, "You have already paid for this group");

        // Effects
        _accounts[msg.sender].escrowBalance = msg.value;
        _groups[groupId].paidCount += 1;
        _totalEscrowLocked += ticketPrice;
        emit MemberJoined(groupId, msg.sender, _groups[groupId].paidCount);

        if (_groups[groupId].paidCount == 1) {
            require(
                availableTickets() >= _groupMembers[groupId].length,
                "Not enough tickets available for this group"
            );
            _reservedTickets += _groupMembers[groupId].length;
            emit TicketsReserved(groupId, _groupMembers[groupId].length);
        }

        // Completion check
        if (_groups[groupId].paidCount == _groupMembers[groupId].length) {
            _releaseTickets(groupId);
        }

        // Interactions: None directly
    }

    /**
     * @notice Cancels an active group before the deadline, refunding all paid members.
     * @dev Only callable by the group creator or contract owner. Sets group state to Cancelled and processes refunds.
     * @param groupId The ID of the group to cancel.
     */
    function cancelGroup(uint256 groupId) external onlyCreatorOrOwner(groupId) nonReentrant {
        // Checks
        require(groupId > 0 && groupId < nextGroupId, "Group does not exist");
        require(_groups[groupId].state == GroupState.Active, "Group is not active");
        require(block.timestamp < _groups[groupId].deadline, "Group deadline has already passed - use refundGroup instead");

        // Effects
        _groups[groupId].state = GroupState.Cancelled;

        // Process refunds
        _processRefunds(groupId);

        // Emit event
        emit GroupCancelled(groupId, msg.sender);
    }

    /**
     * @notice Refunds an active group after the deadline has passed.
     * @dev Callable by anyone. Sets group state to Cancelled and processes refunds.
     * @param groupId The ID of the group to refund.
     */
    function refundGroup(uint256 groupId) external nonReentrant {
        // Checks
        require(groupId > 0 && groupId < nextGroupId, "Group does not exist");
        require(_groups[groupId].state == GroupState.Active, "Group is not active");
        require(block.timestamp >= _groups[groupId].deadline, "Group deadline has not yet passed");

        // Effects
        _groups[groupId].state = GroupState.Cancelled;

        // Process refunds
        _processRefunds(groupId);

        // Emit event
        emit GroupCancelled(groupId, msg.sender);
    }

    /**
     * @notice Private helper to process refunds for all group members.
     * @dev Extracted to avoid code duplication between cancelGroup and refundGroup.
     * Escrow accounting: First, escrow is moved from _totalEscrowLocked to _totalUnclaimedRefunds (effects before interactions).
     * Then, attempt push refund; if successful, remove from _totalUnclaimedRefunds; if failed, add to _unclaimedRefunds mapping.
     * This ensures accounting is consistent even if some refunds fail.
     * Uses two loops: first for effects (state updates), second for interactions (external calls) to prevent reentrancy.
     * If the group had at least one payment, the ticket reservation is released back to the available pool.
     * @param groupId The ID of the group to process refunds for.
     */
    function _processRefunds(uint256 groupId) private {
        if (_groups[groupId].paidCount > 0) {
            _reservedTickets -= _groupMembers[groupId].length;
        }

        uint256 memberCount = _groupMembers[groupId].length;
        uint256[] memory refundAmounts = new uint256[](memberCount);

        // First loop: collect amounts and update state
        for (uint256 i = 0; i < memberCount; i++) {
            address member = _groupMembers[groupId][i];
            refundAmounts[i] = _accounts[member].escrowBalance;

            // Reset account state and move escrow to unclaimed
            _accounts[member].groupId = 0;
            _accounts[member].escrowBalance = 0;
            if (refundAmounts[i] > 0) {
                _totalEscrowLocked -= refundAmounts[i];
                _totalUnclaimedRefunds += refundAmounts[i];
            }
        }

        // Second loop: Interactions
        for (uint256 i = 0; i < memberCount; i++) {
            address member = _groupMembers[groupId][i];
            uint256 refundAmount = refundAmounts[i];

            if (refundAmount > 0) {
                (bool success,) = payable(member).call{value: refundAmount}("");
                if (success) {
                    _totalUnclaimedRefunds -= refundAmount;
                } else {
                    _unclaimedRefunds[member] += refundAmount;
                    emit RefundFailed(groupId, member, refundAmount);
                }
            }
        }
    }

    /**
     * @notice Allows a user to claim a failed automatic refund.
     * @dev Uses Checks-Effects-Interactions: effects first (clear unclaimed), then interaction (transfer).
     * If transfer fails, restores state and reverts to prevent stuck funds.
     */
    function claimRefund() external nonReentrant {
        // Checks
        uint256 amount = _unclaimedRefunds[msg.sender];
        require(amount > 0, "No unclaimed refund available");

        // Effects
        _unclaimedRefunds[msg.sender] = 0;
        _totalUnclaimedRefunds -= amount;

        // Interactions
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) {
            // Restore state on failure
            _unclaimedRefunds[msg.sender] = amount;
            _totalUnclaimedRefunds += amount;
            revert("Claim refund transfer failed - please try again");
        }

        emit RefundClaimed(msg.sender, amount);
    }

    /**
     * @notice Allows a ticket holder to return their ticket for a refund.
     * @dev Transfers the ticket back to the owner's pool and decrements _soldTickets to restore
     *   availability for future groups. Uses Checks-Effects-Interactions.
     *   If transfer fails, restores all state and reverts to maintain consistency.
     *   The nonReentrant modifier prevents reentrant calls, ensuring no reentrancy attacks.
     *   CEI pattern is followed: balances and availability are updated before the external transfer.
     *   Wake's reentrancy warning is a false positive due to the nonReentrant protection.
     */
    function returnTicket() external nonReentrant {
        // Checks
        require(_balances[msg.sender] >= 1, "No ticket available to return");
        require(address(this).balance >= ticketPrice, "Contract has insufficient funds to process this return");

        // Effects
        _balances[msg.sender] -= 1;
        _balances[owner] += 1;
        _soldTickets -= 1;
        emit Transfer(msg.sender, owner, 1);

        // Interactions
        (bool success,) = payable(msg.sender).call{value: ticketPrice}("");
        if (!success) {
            // Restore state on failure
            _balances[msg.sender] += 1;
            _balances[owner] -= 1;
            _soldTickets += 1;
            revert("Ticket return transfer failed - please try again");
        }

        emit TicketReturned(msg.sender, ticketPrice);
    }

    /**
     * @notice Allows the owner to withdraw available funds not locked in escrow or unclaimed refunds.
     * @dev Available funds = contract balance - _totalEscrowLocked - _totalUnclaimedRefunds.
     * This excludes escrowed funds (active groups) and unclaimed refunds (pending claims) to prevent theft.
     */
    function withdrawFunds() external onlyOwner nonReentrant {
        // Checks
        uint256 available = address(this).balance - _totalEscrowLocked - _totalUnclaimedRefunds;
        require(available > 0, "No withdrawable funds available");

        // Effects: none

        // Interactions
        (bool success,) = payable(owner).call{value: available}("");
        require(success, "Owner withdrawal failed - please try again");
    }

    /**
     * @notice Returns the number of tickets currently available for new group reservations.
     * @dev Computed as totalTickets minus tickets already reserved by active groups and
     *   tickets already transferred to completed group members.
     *   Called as an advisory check in createGroup and as the authoritative guard in joinGroup
     *   at the moment of first payment.
     * @return uint256 Number of tickets available for reservation.
     */
    function availableTickets() public view returns (uint256) {
        return totalTickets - _reservedTickets - _soldTickets;
    }

    /**
     * @notice Fallback function to reject direct ETH transfers.
     * @dev Prevents accidental ETH locks; users must use joinGroup for payments.
     */
    receive() external payable {
        revert("Direct ETH transfers not accepted - use joinGroup to purchase a ticket");
    }

    // ---------------------------------------------------------------------
    // Internal Chain Functions
    // ---------------------------------------------------------------------

    /**
     * @notice Adds a completed group as a new block to the on-chain chain.
     * @dev Uses abi.encode (not encodePacked) to prevent hash collisions with dynamic arrays.
     *   Called only from _releaseTickets after all state changes are complete.
     *   Each block cryptographically links to the previous block via previousHash, creating
     *   a verifiable chain of confirmed ticket groups within the contract.
     *   The block hash commits to: chain position, group ID, previous hash, timestamp,
     *   member addresses, and member count.
     * @param groupId The ID of the completed group.
     * @param members The snapshot of group member addresses at completion.
     */
    function _addToChain(uint256 groupId, address[] memory members) internal {
        bytes32 previousHash = _chain[chainLength - 1].blockHash;
        bytes32 newBlockHash = keccak256(abi.encode(
            chainLength,
            groupId,
            previousHash,
            block.timestamp,
            members,
            members.length
        ));

        _chain[chainLength] = TicketBlock({
            blockNumber: chainLength,
            groupId: groupId,
            previousHash: previousHash,
            blockHash: newBlockHash,
            members: members,
            timestamp: block.timestamp,
            ticketCount: members.length
        });

        emit BlockAdded(chainLength, groupId, newBlockHash);
        chainLength += 1;
    }

    // ---------------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------------

    /// @notice Returns the group details for a given group ID.
    function getGroup(uint256 groupId) external view returns (Group memory) {
        return _groups[groupId];
    }

    /// @notice Returns the list of members for a given group ID.
    function getGroupMembers(uint256 groupId) external view returns (address[] memory) {
        return _groupMembers[groupId];
    }

    /// @notice Returns the account details for a given user address.
    function getAccount(address user) external view returns (Account memory) {
        return _accounts[user];
    }

    /// @notice Returns the unclaimed refund amount for a given user address.
    function getUnclaimedRefund(address user) external view returns (uint256) {
        return _unclaimedRefunds[user];
    }

    /**
     * @notice Returns the block at a given chain index.
     * @dev An out-of-range index returns a zero-value TicketBlock struct.
     *   Callers can detect an invalid index via blockHash == bytes32(0),
     *   except for the genesis block which has a non-zero blockHash by design.
     * @param blockIndex The zero-based position in the chain.
     * @return TicketBlock memory The block data at the given index.
     */
    function getChainBlock(uint256 blockIndex) external view returns (TicketBlock memory) {
        return _chain[blockIndex];
    }

    /**
     * @notice Verifies the integrity of the on-chain block chain by checking all hash links.
     * @dev FOR OFF-CHAIN USE ONLY. Must never be called from within a transaction or by another
     *   contract. This function contains an unbounded loop that will exceed the block gas limit
     *   as the chain grows. Safe when called as a view function from ethers.js or similar
     *   off-chain tooling.
     *   Iterates every block from index 1 to chainLength - 1 and verifies that each block's
     *   previousHash matches the actual blockHash of the prior block.
     * @return bool True if all block links are valid, false if any link is broken.
     */
    function verifyChain() external view returns (bool) {
        for (uint256 i = 1; i < chainLength; i++) {
            if (_chain[i].previousHash != _chain[i - 1].blockHash) {
                return false;
            }
        }
        return true;
    }
}
