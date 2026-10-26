const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("InsuranceManager", function () {
  // ─── Fixture ───
  async function deployInsuranceFixture() {
    const [owner, insurer2, insured1, insured2, stranger] = await ethers.getSigners();

    const InsuranceManager = await ethers.getContractFactory("InsuranceManager");
    const contract = await InsuranceManager.deploy();

    // Dépôt initial dans le pool
    await contract.depositFunds({ value: ethers.parseEther("10") });

    return { contract, owner, insurer2, insured1, insured2, stranger };
  }

  async function deployWithPolicyFixture() {
    const base = await deployInsuranceFixture();
    const { contract, owner, insured1 } = base;

    await contract.createPolicy(
      insured1.address,
      0, // AUTO
      ethers.parseEther("0.05"),
      ethers.parseEther("1.0"),
      365,
      "Police AUTO test"
    );

    return { ...base, policyId: 1 };
  }

  async function deployWithClaimFixture() {
    const base = await deployWithPolicyFixture();
    const { contract, insured1 } = base;

    await contract.connect(insured1).declareClaim(
      1,
      ethers.parseEther("0.3"),
      "Accident de voiture",
      "QmHash123"
    );

    return { ...base, claimId: 1 };
  }

  // ========================
  //  DEPLOYMENT
  // ========================
  describe("Déploiement", function () {
    it("Devrait définir le bon propriétaire", async function () {
      const { contract, owner } = await loadFixture(deployInsuranceFixture);
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("Devrait activer le propriétaire comme assureur", async function () {
      const { contract, owner } = await loadFixture(deployInsuranceFixture);
      expect(await contract.insurers(owner.address)).to.be.true;
    });

    it("Devrait avoir un pool initial de 10 ETH", async function () {
      const { contract } = await loadFixture(deployInsuranceFixture);
      expect(await contract.poolBalance()).to.equal(ethers.parseEther("10"));
    });
  });

  // ========================
  //  INSURER MANAGEMENT
  // ========================
  describe("Gestion des assureurs", function () {
    it("Devrait ajouter un assureur", async function () {
      const { contract, insurer2 } = await loadFixture(deployInsuranceFixture);
      await contract.addInsurer(insurer2.address);
      expect(await contract.insurers(insurer2.address)).to.be.true;
    });

    it("Devrait émettre InsurerAdded", async function () {
      const { contract, insurer2 } = await loadFixture(deployInsuranceFixture);
      await expect(contract.addInsurer(insurer2.address))
        .to.emit(contract, "InsurerAdded")
        .withArgs(insurer2.address);
    });

    it("Devrait révoquer un assureur", async function () {
      const { contract, insurer2 } = await loadFixture(deployInsuranceFixture);
      await contract.addInsurer(insurer2.address);
      await contract.removeInsurer(insurer2.address);
      expect(await contract.insurers(insurer2.address)).to.be.false;
    });

    it("Ne devrait pas permettre à un non-propriétaire d'ajouter un assureur", async function () {
      const { contract, stranger, insurer2 } = await loadFixture(deployInsuranceFixture);
      await expect(contract.connect(stranger).addInsurer(insurer2.address))
        .to.be.revertedWith("InsuranceManager: Seul le proprietaire peut executer cette action");
    });
  });

  // ========================
  //  POLICY MANAGEMENT
  // ========================
  describe("Gestion des polices", function () {
    it("Devrait créer une police correctement", async function () {
      const { contract, owner, insured1 } = await loadFixture(deployInsuranceFixture);

      await contract.createPolicy(
        insured1.address, 0,
        ethers.parseEther("0.05"), ethers.parseEther("1.0"),
        365, "Police test"
      );

      const policy = await contract.getPolicy(1);
      expect(policy.insured).to.equal(insured1.address);
      expect(policy.insType).to.equal(0); // AUTO
      expect(policy.premium).to.equal(ethers.parseEther("0.05"));
      expect(policy.coverageAmount).to.equal(ethers.parseEther("1.0"));
      expect(policy.status).to.equal(0); // ACTIVE
    });

    it("Devrait émettre PolicyCreated", async function () {
      const { contract, insured1 } = await loadFixture(deployInsuranceFixture);
      await expect(
        contract.createPolicy(insured1.address, 0, ethers.parseEther("0.05"), ethers.parseEther("1"), 365, "Test")
      )
        .to.emit(contract, "PolicyCreated")
        .withArgs(1, insured1.address, 0, ethers.parseEther("0.05"));
    });

    it("Devrait enregistrer la police dans userPolicies", async function () {
      const { contract, insured1 } = await loadFixture(deployInsuranceFixture);
      await contract.createPolicy(insured1.address, 0, ethers.parseEther("0.05"), ethers.parseEther("1"), 365, "Test");
      const policies = await contract.getUserPolicies(insured1.address);
      expect(policies.length).to.equal(1);
      expect(policies[0]).to.equal(1n);
    });

    it("Devrait confirmer qu'une police active est valide", async function () {
      const { contract, policyId } = await loadFixture(deployWithPolicyFixture);
      expect(await contract.isPolicyActive(policyId)).to.be.true;
    });

    it("Ne devrait pas permettre à un non-assureur de créer une police", async function () {
      const { contract, stranger, insured1 } = await loadFixture(deployInsuranceFixture);
      await expect(
        contract.connect(stranger).createPolicy(insured1.address, 0, ethers.parseEther("0.05"), ethers.parseEther("1"), 365, "Test")
      ).to.be.revertedWith("InsuranceManager: Acces reserve aux assureurs");
    });

    it("Devrait changer le statut d'une police", async function () {
      const { contract, policyId } = await loadFixture(deployWithPolicyFixture);
      await contract.updatePolicyStatus(policyId, 2); // CANCELLED
      const policy = await contract.getPolicy(policyId);
      expect(policy.status).to.equal(2);
    });
  });

  // ========================
  //  CLAIM MANAGEMENT
  // ========================
  describe("Déclaration de sinistres", function () {
    it("Devrait créer un sinistre correctement", async function () {
      const { contract, insured1 } = await loadFixture(deployWithClaimFixture);
      const claim = await contract.getClaim(1);
      expect(claim.claimant).to.equal(insured1.address);
      expect(claim.claimedAmount).to.equal(ethers.parseEther("0.3"));
      expect(claim.status).to.equal(0); // DECLARED
      expect(claim.description).to.equal("Accident de voiture");
    });

    it("Devrait émettre ClaimDeclared", async function () {
      const { contract, insured1 } = await loadFixture(deployWithPolicyFixture);
      await expect(
        contract.connect(insured1).declareClaim(1, ethers.parseEther("0.3"), "Test sinistre", "QmHash")
      )
        .to.emit(contract, "ClaimDeclared")
        .withArgs(1, 1, insured1.address, ethers.parseEther("0.3"));
    });

    it("Ne devrait pas permettre de déclarer un sinistre sur une police inactive", async function () {
      const { contract, owner, insured1, policyId } = await loadFixture(deployWithPolicyFixture);
      await contract.updatePolicyStatus(policyId, 3); // SUSPENDED
      await expect(
        contract.connect(insured1).declareClaim(policyId, ethers.parseEther("0.1"), "Test", "QmHash")
      ).to.be.revertedWith("La police n'est pas active ou a expire");
    });

    it("Ne devrait pas permettre un montant supérieur au plafond", async function () {
      const { contract, insured1, policyId } = await loadFixture(deployWithPolicyFixture);
      await expect(
        contract.connect(insured1).declareClaim(policyId, ethers.parseEther("2.0"), "Test", "QmHash")
      ).to.be.revertedWith("Montant superieur au plafond de couverture");
    });

    it("Ne devrait pas permettre à un non-titulaire de déclarer", async function () {
      const { contract, stranger, policyId } = await loadFixture(deployWithPolicyFixture);
      await expect(
        contract.connect(stranger).declareClaim(policyId, ethers.parseEther("0.1"), "Test", "QmHash")
      ).to.be.revertedWith("InsuranceManager: Vous n'etes pas le titulaire de cette police");
    });
  });

  // ========================
  //  CLAIM WORKFLOW
  // ========================
  describe("Flux de traitement des sinistres", function () {
    it("Devrait passer en UNDER_REVIEW", async function () {
      const { contract } = await loadFixture(deployWithClaimFixture);
      await contract.startClaimReview(1, "En cours d'examen");
      const claim = await contract.getClaim(1);
      expect(claim.status).to.equal(1); // UNDER_REVIEW
    });

    it("Devrait approuver un sinistre", async function () {
      const { contract } = await loadFixture(deployWithClaimFixture);
      await contract.startClaimReview(1, "Examen");
      await contract.approveClaim(1, ethers.parseEther("0.25"), "Approuvé");
      const claim = await contract.getClaim(1);
      expect(claim.status).to.equal(2); // APPROVED
      expect(claim.approvedAmount).to.equal(ethers.parseEther("0.25"));
    });

    it("Devrait rejeter un sinistre", async function () {
      const { contract } = await loadFixture(deployWithClaimFixture);
      await contract.rejectClaim(1, "Documents insuffisants");
      const claim = await contract.getClaim(1);
      expect(claim.status).to.equal(3); // REJECTED
      expect(claim.reviewNotes).to.equal("Documents insuffisants");
    });

    it("Devrait effectuer le paiement et transférer les ETH", async function () {
      const { contract, insured1 } = await loadFixture(deployWithClaimFixture);
      const balanceBefore = await ethers.provider.getBalance(insured1.address);

      await contract.startClaimReview(1, "OK");
      await contract.approveClaim(1, ethers.parseEther("0.3"), "Approuvé");
      await contract.payClaim(1);

      const balanceAfter = await ethers.provider.getBalance(insured1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("0.3"));

      const claim = await contract.getClaim(1);
      expect(claim.status).to.equal(4); // PAID
    });

    it("Devrait déduire du poolBalance lors du paiement", async function () {
      const { contract } = await loadFixture(deployWithClaimFixture);
      const poolBefore = await contract.poolBalance();

      await contract.startClaimReview(1, "OK");
      await contract.approveClaim(1, ethers.parseEther("0.3"), "OK");
      await contract.payClaim(1);

      const poolAfter = await contract.poolBalance();
      expect(poolBefore - poolAfter).to.equal(ethers.parseEther("0.3"));
    });

    it("Devrait émettre ClaimPaid", async function () {
      const { contract, insured1 } = await loadFixture(deployWithClaimFixture);
      await contract.startClaimReview(1, "OK");
      await contract.approveClaim(1, ethers.parseEther("0.3"), "OK");

      await expect(contract.payClaim(1))
        .to.emit(contract, "ClaimPaid")
        .withArgs(1, insured1.address, ethers.parseEther("0.3"));
    });

    it("Ne devrait pas payer deux fois le même sinistre", async function () {
      const { contract } = await loadFixture(deployWithClaimFixture);
      await contract.startClaimReview(1, "OK");
      await contract.approveClaim(1, ethers.parseEther("0.3"), "OK");
      await contract.payClaim(1);

      await expect(contract.payClaim(1))
        .to.be.revertedWith("Le sinistre doit etre APPROVED avant paiement");
    });
  });

  // ========================
  //  FUND MANAGEMENT
  // ========================
  describe("Gestion des fonds", function () {
    it("Devrait déposer des fonds via depositFunds", async function () {
      const { contract } = await loadFixture(deployInsuranceFixture);
      const before = await contract.poolBalance();
      await contract.depositFunds({ value: ethers.parseEther("1") });
      expect(await contract.poolBalance()).to.equal(before + ethers.parseEther("1"));
    });

    it("Devrait déposer des fonds via receive()", async function () {
      const { contract, owner } = await loadFixture(deployInsuranceFixture);
      const before = await contract.poolBalance();
      await owner.sendTransaction({ to: await contract.getAddress(), value: ethers.parseEther("1") });
      expect(await contract.poolBalance()).to.equal(before + ethers.parseEther("1"));
    });

    it("Devrait retirer des fonds pour le propriétaire", async function () {
      const { contract, owner } = await loadFixture(deployInsuranceFixture);
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await contract.withdrawFunds(ethers.parseEther("1"));
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * tx.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      expect(after + gasCost - before).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.001"));
    });

    it("Ne devrait pas permettre le retrait par un non-propriétaire", async function () {
      const { contract, stranger } = await loadFixture(deployInsuranceFixture);
      await expect(contract.connect(stranger).withdrawFunds(ethers.parseEther("1")))
        .to.be.revertedWith("InsuranceManager: Seul le proprietaire peut executer cette action");
    });
  });
});
