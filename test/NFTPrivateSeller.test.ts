import BN from "bn.js";

import { ethers } from "hardhat";
import { Signer } from "ethers";
import { assert } from "chai";

const {
    expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const deployAliumCollectible = async () => {
    const AliumCollectible = await ethers.getContractFactory("AliumCollectible");
    return AliumCollectible.deploy();
}

const deployNFTPrivateSeller = async (
    aliumNftAddress: string,
    founderAddress: string,
    nftTypes: Array<number>,
    stablecoins: Array<string>,
    whiteList: Array<string>
) => {
    const NFTPrivateSeller = await ethers.getContractFactory("NFTPrivateSeller");
    return NFTPrivateSeller.deploy(
        aliumNftAddress,
        founderAddress,
        nftTypes,
        stablecoins,
        whiteList
    );
};

interface TokenTypeData {
    prices: Array<number>,
    amounts: Array<number>
}

async function batchCreateTokenTypes(aliumNft: any, data: TokenTypeData) {
    if (data.prices.length != data.amounts.length) {
        throw new Error('batch create token types, wrong config')
    }

    for (let i = 0; i < data.prices.length; i++) {
        await aliumNft.createNewTokenType(data.prices[i], data.amounts[i], `test type collection ${i}`)
    }
}

describe("NFTPrivateSeller", function () {
    let accounts: Signer[];

    let DAI: any,
        USDC: any,
        USDT: any

    let OWNER: any
    let NEW_OWNER: any
    let FOUNDER: any
    let NEW_FOUNDER: any
    let BUYER: any

    let OWNER_SIGNER: any
    let NEW_OWNER_SIGNER: any
    let FOUNDER_SIGNER: any
    let NEW_FOUNDER_SIGNER: any
    let BUYER_SIGNER: any

    let testCollNomPrice = 100_000 // in usd
    let testColl2NomPrice = Math.floor(testCollNomPrice/2) // in usd
    let testColl3NomPrice = Math.floor(testCollNomPrice/3) // in usd
    let testColl4NomPrice = Math.floor(testCollNomPrice/4) // in usd

    let testCollCardsAmount = 10;
    let testColl2CardsAmount = 20;
    let testColl3CardsAmount = 30;

    before('Configuration',async function () {
        accounts = await ethers.getSigners();

        OWNER_SIGNER = accounts[0];
        FOUNDER_SIGNER = accounts[1];
        BUYER_SIGNER = accounts[2];
        NEW_OWNER_SIGNER = accounts[3];
        NEW_FOUNDER_SIGNER = accounts[4];

        OWNER = await OWNER_SIGNER.getAddress()
        NEW_OWNER = await NEW_OWNER_SIGNER.getAddress()
        FOUNDER = await FOUNDER_SIGNER.getAddress()
        NEW_FOUNDER = await NEW_FOUNDER_SIGNER.getAddress()
        BUYER = await BUYER_SIGNER.getAddress()

        const BEP20Mock = await ethers.getContractFactory("BEP20Mock");

        DAI = await BEP20Mock.deploy('DAI', 'DAI');
        USDC = await BEP20Mock.deploy('USD coin', 'USDC');
        USDT = await BEP20Mock.deploy('USD Tether', 'USDT');
    });

    describe("Management", function () {
        let whiteList: Array<string>;

        beforeEach('private sell', async function() {
            whiteList = []
        });

        it("should change founder", async function () {

            const aliumNft = await deployAliumCollectible();
            await batchCreateTokenTypes(aliumNft, {
                prices: [],
                amounts: []
            })

            await aliumNft.deployed()

            const privateSeller = await deployNFTPrivateSeller(
              aliumNft.address,
              FOUNDER,
              [],
              [DAI.address],
              whiteList
            );

            assert.equal((await privateSeller.founderDetails()).toString(), FOUNDER, "Not founder?")

            await privateSeller.connect(OWNER_SIGNER).changeFounder(NEW_FOUNDER)

            assert.equal((await privateSeller.founderDetails()).toString(), NEW_FOUNDER, "Not new founder?")
        });

        it("should repair tokens", async function () {

            const aliumNft = await deployAliumCollectible();
            await batchCreateTokenTypes(aliumNft, {
                prices: [],
                amounts: []
            })

            await aliumNft.deployed()

            const privateSeller = await deployNFTPrivateSeller(
              aliumNft.address,
              FOUNDER,
              [],
              [DAI.address],
              whiteList
            );

            const lostTokensAmount = 1000;

            await USDC.mint(BUYER, lostTokensAmount)
            assert.equal((await USDC.balanceOf(BUYER)).toString(), lostTokensAmount, "Buyer balance was bed")

            await USDC.connect(BUYER_SIGNER).transfer(privateSeller.address, lostTokensAmount);

            assert.equal((await USDC.balanceOf(privateSeller.address)).toString(), lostTokensAmount, "Lost token disappeared")

            await privateSeller.connect(OWNER_SIGNER).repairToken(USDC.address)

            assert.equal((await USDC.balanceOf(privateSeller.address)).toString(), 0, "Lost token still here")
            assert.equal((await USDC.balanceOf(FOUNDER)).toString(), lostTokensAmount, "Lost token disappeared again")

            await USDC.connect(FOUNDER_SIGNER).burn(lostTokensAmount)
        });


    })

    describe("Sell", function () {
        let whiteList: Array<string>;

        beforeEach('private sell',async function () {
            whiteList = [
                BUYER
            ]
        });

        it("should buy 1 nft token type 1", async function () {

            const expectedTokenType = 1

            const expectedTokenID = 1

            const aliumNft = await deployAliumCollectible();
            await batchCreateTokenTypes(aliumNft, {
                prices: [testCollNomPrice],
                amounts: [testCollCardsAmount]
            })

            await aliumNft.deployed()

            const privateSeller = await deployNFTPrivateSeller(
                aliumNft.address,
                FOUNDER,
                [expectedTokenType],
                [DAI.address],
                whiteList
            );

            await aliumNft.setMinterOnly(privateSeller.address, expectedTokenType);
            await aliumNft.addMinter(privateSeller.address);

            const decimals = await DAI.decimals();
            const reqForOneTokenBuy: string = (new BN(testCollNomPrice).mul(new BN(10).pow(new BN(decimals)))).toString()

            await DAI.mint(BUYER, reqForOneTokenBuy)

            assert.equal((await DAI.balanceOf(BUYER)).toString(), reqForOneTokenBuy, "Buyer balance was bed")

            await DAI.connect(BUYER_SIGNER).approve(privateSeller.address, reqForOneTokenBuy)
            await privateSeller.connect(BUYER_SIGNER).buy(DAI.address, expectedTokenType, reqForOneTokenBuy)

            assert.equal((await aliumNft.getTypeInfo(expectedTokenID)).minterOnly, privateSeller.address, "Not only minter")

            assert.equal(await aliumNft.ownerOf(expectedTokenID), BUYER, "Wa not buyer?")
            assert.equal((await DAI.balanceOf(FOUNDER)).toString(), reqForOneTokenBuy, "FOUNDER didnt get deposit?")

            // get owner collection first item // if error without description, probably failed here
            assert.equal(await privateSeller.collections(BUYER, 0), expectedTokenID, "Not first token?")
        });

        it("should buy batch 2 nft token type 2", async function () {

            const items = 2
            const expectedTokenType = 2

            const expectedTokenID1 = 1
            const expectedTokenID2 = 2

            const aliumNft = await deployAliumCollectible();
            await batchCreateTokenTypes(aliumNft, {
                prices: [testCollNomPrice, testColl2NomPrice, testColl3NomPrice],
                amounts: [testCollCardsAmount, testColl2CardsAmount, testColl3CardsAmount]
            })

            const privateSeller = await deployNFTPrivateSeller(
                aliumNft.address,
                FOUNDER,
                [expectedTokenType],
                [USDC.address],
                whiteList
            );

            await aliumNft.setMinterOnly(privateSeller.address, expectedTokenType);
            await aliumNft.addMinter(privateSeller.address);

            const decimals = await USDC.decimals();
            const reqForOneTokenBuy: string = (new BN(items).mul(new BN(testColl2NomPrice).mul(new BN(10).pow(new BN(decimals))))).toString()

            await USDC.mint(BUYER, reqForOneTokenBuy)

            assert.equal((await USDC.balanceOf(BUYER)).toString(), reqForOneTokenBuy, "Buyer balance was bed")

            await USDC.connect(BUYER_SIGNER).approve(privateSeller.address, reqForOneTokenBuy)
            await privateSeller.connect(BUYER_SIGNER).buyBatch(USDC.address, expectedTokenType, reqForOneTokenBuy, items)

            assert.equal(await aliumNft.ownerOf(expectedTokenID1), BUYER, "Wa not buyer?")
            assert.equal(await aliumNft.ownerOf(expectedTokenID2), BUYER, "Wa not buyer?")
            assert.equal((await USDC.balanceOf(FOUNDER)).toString(), reqForOneTokenBuy, "FOUNDER didnt get deposit?")

            assert.equal((await privateSeller.getCollectionLength(BUYER)).toString(), items, "Collection length is invalid")

            // get owner collection first item // if error without description, probably failed here
            // token id - 1 was issued on previous test
            assert.equal((await privateSeller.collections(BUYER, 0)).toString(), expectedTokenID1, "Not first token?")
            assert.equal((await privateSeller.collections(BUYER, 1)).toString(), expectedTokenID2, "Not second token?")
        });

        it("should fail on batch buy 2'nd nft token type 1 (collection type limit 1 item)", async function () {

            const items = 2
            const expectedTokenType = 1

            const testCollCardsAmount = 1;

            const aliumNft = await deployAliumCollectible();
            await batchCreateTokenTypes(aliumNft, {
                prices: [testColl4NomPrice],
                amounts: [testCollCardsAmount]
            })

            const privateSeller = await deployNFTPrivateSeller(
                aliumNft.address,
                FOUNDER,
                [expectedTokenType],
                [USDT.address],
                whiteList
            );

            await aliumNft.setMinterOnly(privateSeller.address, expectedTokenType);
            await aliumNft.addMinter(privateSeller.address);

            const decimals = await USDT.decimals();
            const reqForOneTokenBuy: string = (new BN(items).mul(new BN(testColl4NomPrice).mul(new BN(10).pow(new BN(decimals))))).toString()

            await USDT.mint(BUYER, reqForOneTokenBuy)

            assert.equal((await USDT.balanceOf(BUYER)).toString(), reqForOneTokenBuy, "Buyer balance was bed")

            await USDT.connect(BUYER_SIGNER).approve(privateSeller.address, reqForOneTokenBuy)

            await expectRevert(
                privateSeller.connect(BUYER_SIGNER).buyBatch(USDT.address, expectedTokenType, reqForOneTokenBuy, items),
                'Sales: tokens limit is exceeded'
            )
        });

        it("should fail on buy 2'nd nft token type 1 (collection type limit 1 item)", async function () {

            const items = 1
            const expectedTokenType = 1

            const testCollCardsAmount = 1;

            const aliumNft = await deployAliumCollectible();
            await batchCreateTokenTypes(aliumNft, {
                prices: [testCollNomPrice],
                amounts: [testCollCardsAmount]
            })

            const privateSeller = await deployNFTPrivateSeller(
                aliumNft.address,
                FOUNDER,
                [expectedTokenType],
                [USDT.address],
                whiteList
            );

            await aliumNft.setMinterOnly(privateSeller.address, expectedTokenType);
            await aliumNft.addMinter(privateSeller.address);

            const decimals = await USDT.decimals();
            const reqForOneTokenBuy: string = (new BN(items).mul(new BN(testCollNomPrice).mul(new BN(10).pow(new BN(decimals))))).toString()

            await USDT.mint(BUYER, reqForOneTokenBuy)

            await USDT.connect(BUYER_SIGNER).approve(privateSeller.address, reqForOneTokenBuy)
            await privateSeller.connect(BUYER_SIGNER).buy(USDT.address, expectedTokenType, reqForOneTokenBuy)

            await USDT.mint(BUYER, reqForOneTokenBuy)

            await USDT.connect(BUYER_SIGNER).approve(privateSeller.address, reqForOneTokenBuy)

            await expectRevert(
                privateSeller.connect(BUYER_SIGNER).buy(USDT.address, expectedTokenType, reqForOneTokenBuy),
                'Sales: all tokens bought'
            )
        });

    })
});
