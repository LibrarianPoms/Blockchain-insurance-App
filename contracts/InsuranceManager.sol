// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title InsuranceManager
 * @notice Système décentralisé de gestion des assurances avec déclaration et suivi des sinistres
 * @dev Contrat principal gérant les polices d'assurance, les assurés et les sinistres
 */
contract InsuranceManager {

    // ========================
    //  ENUMS & STRUCTS
    // ========================

    /// @notice Types d'assurance disponibles
    enum InsuranceType { AUTO, HABITATION, SANTE, VIE, VOYAGE }

    /// @notice Statuts possibles d'un sinistre
    enum ClaimStatus {
        DECLARED,    // Déclaré par l'assuré
        UNDER_REVIEW, // En cours d'examen par l'assureur
        APPROVED,    // Approuvé – remboursement en attente
        REJECTED,    // Rejeté avec motif
        PAID         // Remboursement effectué
    }

    /// @notice Statuts possibles d'une police d'assurance
    enum PolicyStatus { ACTIVE, EXPIRED, CANCELLED, SUSPENDED }

    /// @notice Représente une police d'assurance
    struct Policy {
        uint256 id;
        address insured;          // Adresse de l'assuré
        InsuranceType insType;    // Type d'assurance
        uint256 premium;          // Prime annuelle en wei
        uint256 coverageAmount;   // Montant couvert maximum en wei
        uint256 startDate;        // Timestamp de début
        uint256 endDate;          // Timestamp de fin
        PolicyStatus status;
        string description;       // Description libre de la couverture
    }

    /// @notice Représente un sinistre déclaré
    struct Claim {
        uint256 id;
        uint256 policyId;         // Politique associée
        address claimant;         // Adresse du déclarant
        uint256 declaredAt;       // Timestamp de la déclaration
        uint256 updatedAt;        // Dernier timestamp de mise à jour
        uint256 claimedAmount;    // Montant réclamé en wei
        uint256 approvedAmount;   // Montant approuvé (0 si rejeté)
        ClaimStatus status;
        string description;       // Description de l'incident
        string ipfsDocHash;       // Hash IPFS des documents justificatifs
        string reviewNotes;       // Notes de l'assureur
    }

    // ========================
    //  STATE VARIABLES
    // ========================

    address public owner;         // Propriétaire/assureur principal
    uint256 public policyCounter; // Compteur auto-incrémenté des polices
    uint256 public claimCounter;  // Compteur auto-incrémenté des sinistres
    uint256 public poolBalance;   // Solde du pool d'assurance (en wei)

    /// @notice Mapping des assureurs autorisés (multi-assureur)
    mapping(address => bool) public insurers;

    /// @notice Toutes les polices par ID
    mapping(uint256 => Policy) public policies;

    /// @notice Tous les sinistres par ID
    mapping(uint256 => Claim) public claims;

    /// @notice Polices appartenant à une adresse
    mapping(address => uint256[]) public userPolicies;

    /// @notice Sinistres associés à une police
    mapping(uint256 => uint256[]) public policyClaims;

    /// @notice Sinistres déclarés par une adresse
    mapping(address => uint256[]) public userClaims;

    // ========================
    //  EVENTS
    // ========================

    event PolicyCreated(uint256 indexed policyId, address indexed insured, InsuranceType insType, uint256 premium);
    event PolicyStatusChanged(uint256 indexed policyId, PolicyStatus newStatus);
    event ClaimDeclared(uint256 indexed claimId, uint256 indexed policyId, address indexed claimant, uint256 amount);
    event ClaimStatusUpdated(uint256 indexed claimId, ClaimStatus newStatus, string notes);
    event ClaimPaid(uint256 indexed claimId, address indexed claimant, uint256 amount);
    event InsurerAdded(address indexed insurer);
    event InsurerRemoved(address indexed insurer);
    event FundsDeposited(address indexed from, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);

    // ========================
    //  MODIFIERS
    // ========================

    modifier onlyOwner() {
        require(msg.sender == owner, "InsuranceManager: Seul le proprietaire peut executer cette action");
        _;
    }

    modifier onlyInsurer() {
        require(insurers[msg.sender] || msg.sender == owner, "InsuranceManager: Acces reserve aux assureurs");
        _;
    }

    modifier policyExists(uint256 _policyId) {
        require(_policyId > 0 && _policyId <= policyCounter, "InsuranceManager: Police inexistante");
        _;
    }

    modifier claimExists(uint256 _claimId) {
        require(_claimId > 0 && _claimId <= claimCounter, "InsuranceManager: Sinistre inexistant");
        _;
    }

    modifier onlyPolicyHolder(uint256 _policyId) {
        require(policies[_policyId].insured == msg.sender, "InsuranceManager: Vous n'etes pas le titulaire de cette police");
        _;
    }

    // ========================
    //  CONSTRUCTOR
    // ========================

    constructor() {
        owner = msg.sender;
        insurers[msg.sender] = true; // Le déployeur est le premier assureur
    }

    // ========================
    //  INSURER MANAGEMENT
    // ========================

    /**
     * @notice Ajoute un nouvel assureur autorisé
     * @param _insurer Adresse de l'assureur à ajouter
     */
    function addInsurer(address _insurer) external onlyOwner {
        require(_insurer != address(0), "Adresse invalide");
        require(!insurers[_insurer], "Deja assureur");
        insurers[_insurer] = true;
        emit InsurerAdded(_insurer);
    }

    /**
     * @notice Révoque un assureur
     * @param _insurer Adresse de l'assureur à révoquer
     */
    function removeInsurer(address _insurer) external onlyOwner {
        require(_insurer != owner, "Impossible de retirer le proprietaire");
        insurers[_insurer] = false;
        emit InsurerRemoved(_insurer);
    }

    // ========================
    //  POLICY MANAGEMENT
    // ========================

    /**
     * @notice Crée une nouvelle police d'assurance pour un assuré
     * @param _insured Adresse de l'assuré
     * @param _insType Type d'assurance
     * @param _premium Prime annuelle en wei
     * @param _coverageAmount Montant de couverture maximum en wei
     * @param _durationDays Durée de la police en jours
     * @param _description Description de la couverture
     * @return policyId ID de la nouvelle police
     */
    function createPolicy(
        address _insured,
        InsuranceType _insType,
        uint256 _premium,
        uint256 _coverageAmount,
        uint256 _durationDays,
        string calldata _description
    ) external onlyInsurer returns (uint256 policyId) {
        require(_insured != address(0), "Adresse assuree invalide");
        require(_premium > 0, "La prime doit etre superieure a 0");
        require(_coverageAmount > 0, "Le montant de couverture doit etre superieur a 0");
        require(_durationDays > 0, "La duree doit etre superieure a 0");

        policyCounter++;
        policyId = policyCounter;

        policies[policyId] = Policy({
            id: policyId,
            insured: _insured,
            insType: _insType,
            premium: _premium,
            coverageAmount: _coverageAmount,
            startDate: block.timestamp,
            endDate: block.timestamp + (_durationDays * 1 days),
            status: PolicyStatus.ACTIVE,
            description: _description
        });

        userPolicies[_insured].push(policyId);

        emit PolicyCreated(policyId, _insured, _insType, _premium);
        return policyId;
    }

    /**
     * @notice Modifie le statut d'une police
     * @param _policyId ID de la police
     * @param _newStatus Nouveau statut
     */
    function updatePolicyStatus(uint256 _policyId, PolicyStatus _newStatus)
        external
        onlyInsurer
        policyExists(_policyId)
    {
        policies[_policyId].status = _newStatus;
        emit PolicyStatusChanged(_policyId, _newStatus);
    }

    /**
     * @notice Vérifie si une police est active et valide
     * @param _policyId ID de la police
     * @return bool true si la police est active et non expirée
     */
    function isPolicyActive(uint256 _policyId) public view policyExists(_policyId) returns (bool) {
        Policy storage p = policies[_policyId];
        return (p.status == PolicyStatus.ACTIVE && block.timestamp <= p.endDate);
    }

    // ========================
    //  CLAIM MANAGEMENT
    // ========================

    /**
     * @notice Déclare un nouveau sinistre sur une police active
     * @param _policyId ID de la police concernée
     * @param _claimedAmount Montant réclamé en wei
     * @param _description Description de l'incident
     * @param _ipfsDocHash Hash IPFS des documents (photos, rapports, etc.)
     * @return claimId ID du sinistre créé
     */
    function declareClaim(
        uint256 _policyId,
        uint256 _claimedAmount,
        string calldata _description,
        string calldata _ipfsDocHash
    ) external policyExists(_policyId) onlyPolicyHolder(_policyId) returns (uint256 claimId) {
        require(isPolicyActive(_policyId), "La police n'est pas active ou a expire");
        require(_claimedAmount > 0, "Le montant reclame doit etre superieur a 0");
        require(_claimedAmount <= policies[_policyId].coverageAmount, "Montant superieur au plafond de couverture");
        require(bytes(_description).length > 0, "La description est obligatoire");

        claimCounter++;
        claimId = claimCounter;

        claims[claimId] = Claim({
            id: claimId,
            policyId: _policyId,
            claimant: msg.sender,
            declaredAt: block.timestamp,
            updatedAt: block.timestamp,
            claimedAmount: _claimedAmount,
            approvedAmount: 0,
            status: ClaimStatus.DECLARED,
            description: _description,
            ipfsDocHash: _ipfsDocHash,
            reviewNotes: ""
        });

        policyClaims[_policyId].push(claimId);
        userClaims[msg.sender].push(claimId);

        emit ClaimDeclared(claimId, _policyId, msg.sender, _claimedAmount);
        return claimId;
    }

    /**
     * @notice Passe un sinistre en statut "En cours d'examen"
     * @param _claimId ID du sinistre
     * @param _notes Notes initiales de l'assureur
     */
    function startClaimReview(uint256 _claimId, string calldata _notes)
        external
        onlyInsurer
        claimExists(_claimId)
    {
        Claim storage c = claims[_claimId];
        require(c.status == ClaimStatus.DECLARED, "Le sinistre doit etre en statut DECLARED");

        c.status = ClaimStatus.UNDER_REVIEW;
        c.reviewNotes = _notes;
        c.updatedAt = block.timestamp;

        emit ClaimStatusUpdated(_claimId, ClaimStatus.UNDER_REVIEW, _notes);
    }

    /**
     * @notice Approuve un sinistre avec un montant de remboursement
     * @param _claimId ID du sinistre
     * @param _approvedAmount Montant approuvé pour le remboursement
     * @param _notes Notes justificatives
     */
    function approveClaim(uint256 _claimId, uint256 _approvedAmount, string calldata _notes)
        external
        onlyInsurer
        claimExists(_claimId)
    {
        Claim storage c = claims[_claimId];
        require(
            c.status == ClaimStatus.DECLARED || c.status == ClaimStatus.UNDER_REVIEW,
            "Statut invalide pour approbation"
        );
        require(_approvedAmount > 0, "Le montant approuve doit etre superieur a 0");
        require(
            _approvedAmount <= policies[c.policyId].coverageAmount,
            "Montant superieur au plafond de couverture"
        );
        require(poolBalance >= _approvedAmount, "Fonds insuffisants dans le pool");

        c.status = ClaimStatus.APPROVED;
        c.approvedAmount = _approvedAmount;
        c.reviewNotes = _notes;
        c.updatedAt = block.timestamp;

        emit ClaimStatusUpdated(_claimId, ClaimStatus.APPROVED, _notes);
    }

    /**
     * @notice Rejette un sinistre avec un motif
     * @param _claimId ID du sinistre
     * @param _reason Motif du rejet
     */
    function rejectClaim(uint256 _claimId, string calldata _reason)
        external
        onlyInsurer
        claimExists(_claimId)
    {
        Claim storage c = claims[_claimId];
        require(
            c.status == ClaimStatus.DECLARED || c.status == ClaimStatus.UNDER_REVIEW,
            "Statut invalide pour rejet"
        );
        require(bytes(_reason).length > 0, "Un motif de rejet est obligatoire");

        c.status = ClaimStatus.REJECTED;
        c.reviewNotes = _reason;
        c.updatedAt = block.timestamp;

        emit ClaimStatusUpdated(_claimId, ClaimStatus.REJECTED, _reason);
    }

    /**
     * @notice Effectue le paiement d'un sinistre approuvé
     * @param _claimId ID du sinistre à payer
     */
    function payClaim(uint256 _claimId) external onlyInsurer claimExists(_claimId) {
        Claim storage c = claims[_claimId];
        require(c.status == ClaimStatus.APPROVED, "Le sinistre doit etre APPROVED avant paiement");
        require(c.approvedAmount > 0, "Aucun montant approuve");
        require(poolBalance >= c.approvedAmount, "Fonds insuffisants dans le pool");

        uint256 amount = c.approvedAmount;
        address claimant = c.claimant;

        c.status = ClaimStatus.PAID;
        c.updatedAt = block.timestamp;
        poolBalance -= amount;

        (bool success, ) = payable(claimant).call{value: amount}("");
        require(success, "Echec du transfert ETH");

        emit ClaimPaid(_claimId, claimant, amount);
        emit ClaimStatusUpdated(_claimId, ClaimStatus.PAID, "Remboursement effectue");
    }

    // ========================
    //  FUND MANAGEMENT
    // ========================

    /**
     * @notice Dépôt de fonds dans le pool d'assurance
     */
    function depositFunds() external payable {
        require(msg.value > 0, "Montant nul");
        poolBalance += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Retrait de fonds par le propriétaire
     * @param _amount Montant en wei à retirer
     */
    function withdrawFunds(uint256 _amount) external onlyOwner {
        require(_amount <= poolBalance, "Solde insuffisant");
        poolBalance -= _amount;
        (bool success, ) = payable(owner).call{value: _amount}("");
        require(success, "Echec du retrait");
        emit FundsWithdrawn(owner, _amount);
    }

    // ========================
    //  VIEW FUNCTIONS
    // ========================

    /**
     * @notice Retourne toutes les polices d'un assuré
     * @param _user Adresse de l'assuré
     */
    function getUserPolicies(address _user) external view returns (uint256[] memory) {
        return userPolicies[_user];
    }

    /**
     * @notice Retourne tous les sinistres d'un utilisateur
     * @param _user Adresse du déclarant
     */
    function getUserClaims(address _user) external view returns (uint256[] memory) {
        return userClaims[_user];
    }

    /**
     * @notice Retourne tous les sinistres associés à une police
     * @param _policyId ID de la police
     */
    function getPolicyClaims(uint256 _policyId) external view returns (uint256[] memory) {
        return policyClaims[_policyId];
    }

    /**
     * @notice Retourne les détails complets d'une police
     */
    function getPolicy(uint256 _policyId) external view policyExists(_policyId) returns (Policy memory) {
        return policies[_policyId];
    }

    /**
     * @notice Retourne les détails complets d'un sinistre
     */
    function getClaim(uint256 _claimId) external view claimExists(_claimId) returns (Claim memory) {
        return claims[_claimId];
    }

    /**
     * @notice Retourne le solde ETH du contrat
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ========================
    //  FALLBACK
    // ========================

    receive() external payable {
        poolBalance += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }
}
