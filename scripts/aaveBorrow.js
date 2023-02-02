const { ethers, getNamedAccounts } = require("hardhat")
const { getWETH, AMOUNT } = require("./getWETH")

async function main() {
    await getWETH()
    const { deployer } = await getNamedAccounts()
    let daiprice = await getDaiPrice()

    // Lending Pool Address Provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    // from https://docs.aave.com/developers/v/2.0/deployed-contracts/deployed-contracts
    const lendingPool = await getLendingPool(deployer)
    console.log(`Lending Pool Address: ${lendingPool.address}`)

    // deposit
    // approve first
    const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    const daiAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log(`depositing ${AMOUNT} ETH, which is worth ${AMOUNT / daiprice}`)
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("deposited!")

    // availableBorrowETH converted to DAI? We need the DAI/ETH price
    // Borrowing
    // how much ??
    let { totalCollateralETH, totalDebtETH, availableBorrowsETH } = await getBorrowUserData(
        daiAddress,
        lendingPool,
        deployer
    )

    const amountDaiToBorrow = (availableBorrowsETH / daiprice) * 0.95
    console.log(`DAI amount that can be borrowed including 5 % safety margin: ${amountDaiToBorrow}`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString(), "wei")
    console.log(`Borrowable DAI in wei: ${amountDaiToBorrowWei}`)

    // borrow DAI
    await borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, deployer)

    // show current state of the account w.r.t. lending at aave
    await getBorrowUserData(daiAddress, lendingPool, deployer)

    await repayDai(daiAddress, lendingPool, amountDaiToBorrowWei, deployer)

    await getBorrowUserData(daiAddress, lendingPool, deployer)
}

async function repayDai(asset, lendingPool, amountRepayDai, account) {
    console.log("Approve the DAI payback..")
    await approveErc20(asset, lendingPool.address, amountRepayDai, account)
    console.log(`Repay ${amountRepayDai} DAI to aave..`)
    const tx = await lendingPool.repay(asset, amountRepayDai, 2, account)
    await tx.wait(1)
    console.log("Repayed!")
}

async function borrowDai(daiAddress, lendingPool, amountDaiToBorrowWei, account) {
    console.log("Borrowing DAI...")
    const tx = await lendingPool.borrow(daiAddress, amountDaiToBorrowWei, 2, 0, account)
    await tx.wait(1)
    console.log("Borrowing finished!")
}

async function getDaiBalance(daiAddress, account) {
    const daiContract = await ethers.getContractAt("IERC20", daiAddress)
    console.log(`New DAI balance of deployer: ${await daiContract.balanceOf(account)}`)
}

async function getDaiPrice() {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        "0x773616E4d11A78F511299002da57A0a94577F1f4"
    )
    const price = (await daiEthPriceFeed.latestRoundData())[1]
    console.log(`DAI / ETH price: ${1 / (parseInt(price.toString()) / Math.pow(10, 18))}`)

    return price
}

async function getBorrowUserData(daiAddress, lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)
    console.log(
        `totalCollateralETH: ${totalCollateralETH}, totalDebtETH: ${totalDebtETH}, availableBorrowsETH: ${availableBorrowsETH}`
    )
    await getDaiBalance(daiAddress, account)
    return { totalCollateralETH, totalDebtETH, availableBorrowsETH }
}

async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
        account
    )
    const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)

    return lendingPool
}

async function approveErc20(erc20Address, spenderAddress, amountToSpend, account) {
    const erc20Token = await ethers.getContractAt("IERC20", erc20Address, account)
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)
    console.log("Approved!")
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
