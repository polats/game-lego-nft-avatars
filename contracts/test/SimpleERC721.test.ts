import {expect} from './chai-setup';
import {
  ethers,
  deployments,
  getUnnamedAccounts,
  getNamedAccounts,
} from 'hardhat';
import {SimpleERC721} from '../typechain';
import {setupUser, setupUsers} from './utils';

const setup = deployments.createFixture(async () => {
  await deployments.fixture('SimpleERC721');
  const {simpleERC721Beneficiary, zeroAccount} = await getNamedAccounts();
  const contracts = {
    SimpleERC721: <SimpleERC721>await ethers.getContract('SimpleERC721'),
  };
  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  return {
    ...contracts,
    users,
    zeroAccount: await setupUser(zeroAccount, contracts),
    simpleERC721Beneficiary: await setupUser(simpleERC721Beneficiary, contracts),
  };
});

describe('Simple ERC721', function () {
  it('mint succeeds', async function () {
    const {users, zeroAccount, SimpleERC721} = await setup();

    await expect(
      users[0].SimpleERC721.mint(1)
    )
      .to.emit(SimpleERC721, 'Transfer')
      .withArgs(zeroAccount.address, users[0].address, 1);

  });

  it('transfer succeed', async function () {
    const {users, simpleERC721Beneficiary, SimpleERC721} = await setup();
    await users[0].SimpleERC721.mint(1);

    await expect(
      users[0].SimpleERC721.transferFrom(users[0].address, users[1].address, 1)
    )
      .to.emit(SimpleERC721, 'Transfer')
      .withArgs(users[0].address, users[1].address, 1);
  });
});
