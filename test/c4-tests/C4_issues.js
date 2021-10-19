const { expect } = require("chai");
const { BigNumber } = require('ethers');

const {getAll, mineBlocks, getDeployedContract, getRewardsLocked,getAllocatedTokensPerEpoch, getMaxCapMultiplier, getEndEpoch,
    oneToken, OWNER, VALIDATOR_1, VALIDATOR_2, OPERATOR_1,
    OPERATOR_2, DELEGATOR_1, DELEGATOR_2, CQT, stake} = require("../helpers");

describe("C4 issues", function () {
  it("Unable to redeem rest funds if deposited reward is not multiplier of allocatedTokensPerEpoch", async function () {
    const [contract, cqtContract, validator1, validator2, delegator1, delegator2 ] = await getAll()
    const tokensPerEpoch = await getAllocatedTokensPerEpoch(contract);

    const epoch = BigNumber.from('10');
    const restFunds = tokensPerEpoch.div(BigNumber.from('2'));
    // Add reward wich is not multiplier of allocatedTokensPerEpoch.
    const totalReward = tokensPerEpoch.mul(epoch).add(restFunds);

    await cqtContract.approve(contract.address, totalReward);
    await contract.depositRewardTokens(totalReward);

    const stakeAmount = oneToken;
    await contract.addValidator(VALIDATOR_1, OPERATOR_1, 10);
    await stake(stakeAmount, validator1, cqtContract, contract, 0)

    // Mine enough blocks (10 blocks more from end epoch)
    await mineBlocks(epoch.add(BigNumber.from('10')).toNumber());
    await contract.connect(validator1).redeemAllRewards(0, VALIDATOR_1);

    // We mined enough blocks to get all reward, but it is impossible to redeem `restFunds`.
    // It means restFunds is unable to redeem

    // This line should be work, but failure.
    expect(await cqtContract.balanceOf(contract.address)).to.equal(stakeAmount);

    // User staked 1 CQT, but balance of contract is 1.5 CQT. 0.5 CQT is unable to being redeemed by any validators

    // expect(await cqtContract.balanceOf(contract.address)).to.equal(stakeAmount.add(restFunds));
  });

  it("Users could lose funds if owner took out reward which is not multiplier of allocatedTokensPerEpoch", async function () {
    const [contract, cqtContract, validator1, validator2, delegator1, delegator2 ] = await getAll()
    const tokensPerEpoch = await getAllocatedTokensPerEpoch(contract);

    const epoch = BigNumber.from('10');
    const totalReward = tokensPerEpoch.mul(epoch);

    await cqtContract.approve(contract.address, totalReward);
    await contract.depositRewardTokens(totalReward);

    const stakeAmount = oneToken;
    await contract.addValidator(VALIDATOR_1, OPERATOR_1, 10);
    await stake(stakeAmount, validator1, cqtContract, contract, 0)

    const restFunds = tokensPerEpoch.div(BigNumber.from('4'));
    const takeOutAmount = tokensPerEpoch.add(restFunds)
    // Takeout reward which is not multiplier of allocatedTokensPerEpoch
    await contract.takeOutRewardTokens(takeOutAmount)

    // Mine enough blocks (10 blocks more from end epoch)
    await mineBlocks(epoch.add(BigNumber.from('10')).toNumber());
    await contract.connect(validator1).redeemAllRewards(0, VALIDATOR_1);

    // We mined enough blocks to get all reward, and this leads to reduce staked amount.
    // We already redeemed all rewards, so the balance of contract should be same as stake amount,
    // But the result is that balance of contract is stakeAmount - restFunds.

    // This line should be work, but failure due to rest amount
    expect(await cqtContract.balanceOf(contract.address)).to.equal(stakeAmount);

    // User staked 1 CQT, but balance of contract is 0.75 CQT
    // expect(await cqtContract.balanceOf(contract.address)).to.equal(stakeAmount.sub(restFunds));

    // Since the balance is less than stake amount, the validator is unable to unstake all tokens.
  });

  it("Incorrect updateGlobalExchangeRate implementation", async function () {
    const [contract, cqtContract, validator1, validator2, delegator1, delegator2 ] = await getAll()
    const tokensPerEpoch = await getAllocatedTokensPerEpoch(contract);

    const epoch = BigNumber.from('20');
    const totalReward = tokensPerEpoch.mul(epoch);

    await cqtContract.approve(contract.address, totalReward);
    await contract.depositRewardTokens(totalReward);

    const stakeAmount = oneToken;
    await contract.addValidator(VALIDATOR_1, OPERATOR_1, 10);
    await stake(stakeAmount, validator1, cqtContract, contract, 0)

    // This will make `totalGlobalShares` to zero
    await contract.disableValidator(0);

    await contract.connect(validator1).redeemAllRewards(0, VALIDATOR_1);

    console.log((await cqtContract.balanceOf(contract.address)).toString())
    // Current CQL balance is 20 CQL.
    // Staked amount is 1 CQL, so remaining reward is 19 CQL
    await mineBlocks(10);

    await contract.addValidator(VALIDATOR_2, OPERATOR_2, 10);
    await stake(stakeAmount, validator2, cqtContract, contract, 1)

    // Mine enough blocks (10 blocks more from end epoch)
    await mineBlocks(epoch.add(BigNumber.from('10')).toNumber());

    await contract.connect(validator2).redeemAllRewards(1, VALIDATOR_2);

    expect(await cqtContract.balanceOf(contract.address)).to.equal(stakeAmount.add(stakeAmount));
    // Total staked amount is 2 CQL (validator1 + validator2)
    // But current CQL balance is 16 CQL
    // Here 14 CQL is unable to redeemed.
  });
});
