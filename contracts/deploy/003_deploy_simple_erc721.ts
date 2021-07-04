import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {parseEther} from 'ethers/lib/utils';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer, simpleERC721Beneficiary} = await getNamedAccounts();

  await deploy('SimpleERC721', {
    from: deployer,
    // args: [simpleERC721Beneficiary, parseEther('1000000000')],
    log: true,
  });
};
export default func;
func.tags = ['SimpleERC721'];
