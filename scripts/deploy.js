const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Déploiement du contrat InsuranceManager...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`📋 Compte déployeur : ${deployer.address}`);
  console.log(`💰 Solde : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH\n`);

  // Déploiement du contrat
  const InsuranceManager = await ethers.getContractFactory("InsuranceManager");
  const insuranceManager = await InsuranceManager.deploy();
  await insuranceManager.waitForDeployment();

  const address = await insuranceManager.getAddress();
  console.log(`✅ InsuranceManager déployé à l'adresse : ${address}`);

  // Dépôt initial de fonds dans le pool (0.5 ETH)
  console.log("\n💵 Dépôt initial de 0.5 ETH dans le pool...");
  const depositTx = await insuranceManager.depositFunds({
    value: ethers.parseEther("0.5"),
  });
  await depositTx.wait();
  console.log("✅ Fonds déposés avec succès");

  console.log(`\n📊 Résumé du déploiement:`);
  console.log(`   Adresse du contrat : ${address}`);
  console.log(`   Pool de fonds      : ${ethers.formatEther(await insuranceManager.poolBalance())} ETH`);
  console.log(`   Propriétaire       : ${await insuranceManager.owner()}`);

  // Sauvegarde de l'adresse pour le frontend
  const fs = require("fs");
  const deployInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    contractAddress: address,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  fs.writeFileSync(
    "./frontend/src/deployInfo.json",
    JSON.stringify(deployInfo, null, 2)
  );
  console.log("\n📁 Informations de déploiement sauvegardées dans frontend/src/deployInfo.json");

  // Copie de l'ABI pour le frontend
  const artifact = await import(`./artifacts/contracts/InsuranceManager.sol/InsuranceManager.json`, {
    assert: { type: "json" },
  }).catch(() => null);

  if (artifact) {
    fs.writeFileSync(
      "./frontend/src/InsuranceManagerABI.json",
      JSON.stringify(artifact.default.abi, null, 2)
    );
    console.log("📁 ABI sauvegardée dans frontend/src/InsuranceManagerABI.json");
  }

  console.log("\n🎉 Déploiement terminé !");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Erreur de déploiement :", error);
    process.exit(1);
  });
