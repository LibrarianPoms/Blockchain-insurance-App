/**
 * Script de démonstration : crée des polices et sinistres d'exemple
 * Usage : npx hardhat run scripts/seed.js --network localhost
 */
const { ethers } = require("hardhat");

async function main() {
  const [owner, insured1, insured2, insured3] = await ethers.getSigners();

  // Charger l'adresse du contrat déployé
  let contractAddress;
  try {
    const deployInfo = require("../frontend/src/deployInfo.json");
    contractAddress = deployInfo.contractAddress;
  } catch {
    console.error("❌ Exécutez d'abord: npx hardhat run scripts/deploy.js --network localhost");
    process.exit(1);
  }

  console.log("🌱 Initialisation des données de démonstration...\n");

  const InsuranceManager = await ethers.getContractFactory("InsuranceManager");
  const contract = InsuranceManager.attach(contractAddress);

  // ─── Création de polices ───
  console.log("📄 Création de polices d'assurance...");

  const tx1 = await contract.connect(owner).createPolicy(
    insured1.address,
    0, // AUTO
    ethers.parseEther("0.05"),
    ethers.parseEther("1.0"),
    365,
    "Assurance auto tous risques – véhicule personnel"
  );
  await tx1.wait();
  console.log(`  ✅ Police AUTO créée pour ${insured1.address.slice(0, 10)}...`);

  const tx2 = await contract.connect(owner).createPolicy(
    insured2.address,
    1, // HABITATION
    ethers.parseEther("0.03"),
    ethers.parseEther("0.8"),
    365,
    "Assurance habitation multirisque – appartement T3"
  );
  await tx2.wait();
  console.log(`  ✅ Police HABITATION créée pour ${insured2.address.slice(0, 10)}...`);

  const tx3 = await contract.connect(owner).createPolicy(
    insured3.address,
    2, // SANTE
    ethers.parseEther("0.08"),
    ethers.parseEther("0.5"),
    180,
    "Assurance santé complémentaire – formule premium"
  );
  await tx3.wait();
  console.log(`  ✅ Police SANTÉ créée pour ${insured3.address.slice(0, 10)}...`);

  // ─── Déclarations de sinistres ───
  console.log("\n🚨 Déclaration de sinistres...");

  const claim1 = await contract.connect(insured1).declareClaim(
    1,
    ethers.parseEther("0.2"),
    "Accident de voiture au carrefour, dommages sur le capot et l'aile avant droite. Tiers identifié.",
    "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  );
  await claim1.wait();
  console.log("  ✅ Sinistre AUTO déclaré (Sinistre #1)");

  const claim2 = await contract.connect(insured2).declareClaim(
    2,
    ethers.parseEther("0.15"),
    "Dégât des eaux suite à une fuite de canalisation dans la cuisine. Parquet et électroménager endommagés.",
    "QmYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY"
  );
  await claim2.wait();
  console.log("  ✅ Sinistre HABITATION déclaré (Sinistre #2)");

  // ─── Traitement des sinistres ───
  console.log("\n⚙️  Traitement des sinistres...");

  await (await contract.connect(owner).startClaimReview(1, "Dossier reçu. Expertise en cours.")).wait();
  console.log("  🔍 Sinistre #1 : Mis en examen");

  await (await contract.connect(owner).approveClaim(1, ethers.parseEther("0.18"), "Expertise validée. Dommages confirmés à 90%. Remboursement de 0.18 ETH approuvé.")).wait();
  console.log("  ✅ Sinistre #1 : Approuvé pour 0.18 ETH");

  await (await contract.connect(owner).payClaim(1)).wait();
  console.log("  💸 Sinistre #1 : Paiement effectué");

  await (await contract.connect(owner).startClaimReview(2, "Analyse du dossier en cours. Demande de devis plombier.")).wait();
  console.log("  🔍 Sinistre #2 : Mis en examen");

  console.log("\n📊 État final :");
  console.log(`   Polices créées   : ${await contract.policyCounter()}`);
  console.log(`   Sinistres déclarés : ${await contract.claimCounter()}`);
  console.log(`   Pool restant     : ${ethers.formatEther(await contract.poolBalance())} ETH`);

  console.log("\n🎉 Données de démonstration créées avec succès !");
}

main().catch((e) => { console.error(e); process.exit(1); });
