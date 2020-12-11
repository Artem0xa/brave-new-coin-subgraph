import { Address, BigDecimal, BigInt, log } from "@graphprotocol/graph-ts";
import { BraveNewCoin, Transfer, Approval, NewCloneToken } from "../generated/BraveNewCoin/BraveNewCoin";
import {
	Token,
	TokenSupply,
	PrevTokenSupply,
  Transfer as TransferEntity,
  Approval as ApprovalEntity,
  NewCloneToken as NewCloneTokenEntity,
	Balance,
} from "../generated/schema";

export function handleNewCloneToken(event: NewCloneToken): void {
  let entity = NewCloneTokenEntity.load(event.params._cloneToken.toHex())

  if (entity == null) {
    entity = new NewCloneTokenEntity(event.params._cloneToken.toHex())
  }

  entity.save()
}


export function handleApproval(event: Approval): void {
  let entity = ApprovalEntity.load(event.params._owner.toHex())

  if (entity == null) {
    entity = new ApprovalEntity(event.params._owner.toHex())
  }

  entity.owner = event.params._owner
  entity.spender = event.params._spender
  entity.value = event.params._amount
  entity.save()
}

function initToken(
	tokenId: string,
	tokenSupplyId: string,
	totalSupplyVal: BigDecimal,
	event: Transfer,
	token: Token | null
): void {
	token = new Token(tokenId);
	token.save();
	let prevTokenSupply = new PrevTokenSupply(tokenId);
	saveTokenSupply(
		tokenSupplyId,
		totalSupplyVal,
		event,
		token,
		prevTokenSupply
	);
}

function initBalance(address: string): void {
	let balance = Balance.load(address);
	if (balance === null && !address.startsWith("0x000000")) {
		balance = new Balance(address);
		balance.amount = BigDecimal.fromString("0");
		balance.save();
	}
}

function saveTokenSupply(
	tokenSupplyId: string,
	totalSupplyVal: BigDecimal,
	event: Transfer,
	token: Token | null,
	prevTokenSupply: PrevTokenSupply | null
): void {
	// record totalSupply changes
	let tokenSupply = new TokenSupply(tokenSupplyId);
	tokenSupply.totalSupply = totalSupplyVal;
	tokenSupply.timestamp = event.block.timestamp;
	tokenSupply.token = token.id;
	tokenSupply.save();
	prevTokenSupply.totalSupply = totalSupplyVal;
	prevTokenSupply.save();
}

function saveTransaction(
	transferId: string,
	fromAddress: string,
	toAddress: string,
	transferAmount: BigDecimal,
	timestamp: BigInt
): void {
	let transfer = new TransferEntity(transferId);
	transfer.from = fromAddress;
	transfer.to = toAddress;
	transfer.amount = transferAmount;
	transfer.timestamp = timestamp;
	// date methods are not supported in AS
	// let date = new Date(timestamp.toI32());
	// transfer.date = date.toLocaleDateString("en-US");
	transfer.save();
}

function saveBalance(
	fromAddress: string,
	toAddress: string,
	transferAmount: BigDecimal
): void {
	initBalance(fromAddress);
	initBalance(toAddress);

	let fromBalance = Balance.load(fromAddress);
	let toBalance = Balance.load(toAddress);

	if (fromBalance !== null) {
		fromBalance.amount = fromBalance.amount.minus(transferAmount);
		fromBalance.save();
	}
	if (toBalance !== null) {
		toBalance.amount = toBalance.amount.plus(transferAmount);
		toBalance.save();
	}
}

export function handleTransfer(event: Transfer): void {
	let contract = BraveNewCoin.bind(event.address);
	let totalSupplyVal: BigDecimal;
	let tokenId = event.address.toHex();
	let fromAddress = event.params._from.toHex();
	let toAddress = event.params._to.toHex();

	let totalSupply = contract.totalSupply();
	let decimals = contract.decimals();
	let decimalsTotal = toDecimalExponent(BigInt.fromI32(decimals));
	let decimalTotalSupply = convertToDecimal(totalSupply, decimalsTotal);
	totalSupplyVal = decimalTotalSupply;
	let transferAmount = convertToDecimal(event.params._amount, decimalsTotal);
	let timestamp = event.block.timestamp;

	// load token
	let token = Token.load(tokenId);
	let transferId = event.transaction.hash.toHex();

	// in initial, instantiate a new token entity
	if (!token) {
		initToken(tokenId, transferId, totalSupplyVal, event, token);
	} else {
		// otherwise, update supply if changed from previous record
		let prevTokenSupply = PrevTokenSupply.load(tokenId);

		if (prevTokenSupply.totalSupply != totalSupplyVal) {
			saveTokenSupply(
				transferId,
				totalSupplyVal,
				event,
				token,
				prevTokenSupply
			);
		}
	}

	// record transaction
	saveTransaction(
		transferId,
		fromAddress,
		toAddress,
		transferAmount,
		timestamp
	);

	// record balance
	saveBalance(fromAddress, toAddress, transferAmount);
}

function toDecimalExponent(decimals: BigInt): BigInt {
	let decimalTotal = BigInt.fromI32(10);
	for (
		let i = BigInt.fromI32(1);
		i.lt(decimals);
		i = i.plus(BigInt.fromI32(1))
	) {
		decimalTotal = decimalTotal.times(BigInt.fromI32(10));
	}
	return decimalTotal;
}

function convertToDecimal(
	amount: BigInt,
	decimalTotal: BigInt
): BigDecimal {
	return amount.toBigDecimal().div(decimalTotal.toBigDecimal());
}
