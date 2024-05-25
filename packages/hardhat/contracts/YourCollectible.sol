//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "./Groth16Verifier.sol";

/**
 * A smart contract that uses a Groth16 verifier to mint ERC721 tokens.
 * @author BuidlGuidl
 */
contract YourCollectible is ERC721, Groth16Verifier {
	// ----------------------
	// Predefined constants |
	// ----------------------

	// This us the ETHBerlin event UUID converted to bigint
	uint256[1] VALID_EVENT_IDS = [
		111560146890584288369567824893314450802
	];

	// This is hex to bigint conversion for ETHBerlin signer
	uint256[2] ETHBERLIN_SIGNER = [
		13908133709081944902758389525983124100292637002438232157513257158004852609027,
		7654374482676219729919246464135900991450848628968334062174564799457623790084
	];

	// ----------------------
	// State variables      |
	// ----------------------

	uint256 private _nextTokenId;
	mapping(address => bool) public minted;

	struct ProofArgs {
		uint256[2] _pA;
		uint256[2][2] _pB;
		uint256[2] _pC;
		uint256[38] _pubSignals;
	}

	// ----------------------
	// Modifiers            |
	// ----------------------

	modifier verifiedProof(ProofArgs calldata proof) {
		require(
			this.verifyProof(
				proof._pA,
				proof._pB,
				proof._pC,
				proof._pubSignals
			),
			"Invalid proof"
		);
		_;
	}

	modifier validEventIds(uint256[38] memory _pubSignals) {
		uint256[] memory eventIds = getValidEventIdFromPublicSignals(
			_pubSignals
		);
		require(
			keccak256(abi.encodePacked(eventIds)) ==
				keccak256(abi.encodePacked(VALID_EVENT_IDS)),
			"Invalid event ids"
		);
		_;
	}

	modifier validSigner(uint256[38] memory _pubSignals) {
		uint256[2] memory signer = getSignerFromPublicSignals(_pubSignals);
		require(
			signer[0] == ETHBERLIN_SIGNER[0] && signer[1] == ETHBERLIN_SIGNER[1],
			"Invalid signer"
		);
		_;
	}

	modifier validWaterMark(uint256[38] memory _pubSignals) {
		require(
			getWaterMarkFromPublicSignals(_pubSignals) ==
				uint256(uint160(msg.sender)),
			"Invalid watermark"
		);
		_;
	}

	modifier notMinted() {
		require(!minted[msg.sender], "Already minted");
		_;
	}

	constructor() ERC721("YourCollectible", "YCB") {}

	function mintItem(
		ProofArgs calldata proof
	)
		public
		verifiedProof(proof)
		validEventIds(proof._pubSignals)
		validSigner(proof._pubSignals)
		notMinted
	{
		uint256 tokenId = _nextTokenId++;
		minted[msg.sender] = true;
		_safeMint(msg.sender, tokenId);
	}

	function tokenURI(
		uint256 _tokenId
	) public view override returns (string memory) {
		require(_tokenId < _nextTokenId, "tokenId does not exist");
		return "https://austingriffith.com/images/paintings/buffalo.jpg";
	}

	// ----------------------------------------------------------
	// Utility functions for destructuring a proof publicSignals|
	// ----------------------------------------------------------

	function getWaterMarkFromPublicSignals(
		uint256[38] memory _pubSignals
	) public pure returns (uint256) {
		return _pubSignals[37];
	}

	// Numbers of events is arbitary but for this example we are using 10 (including test eventID)
	function getValidEventIdFromPublicSignals(
		uint256[38] memory _pubSignals
	) public view returns (uint256[] memory) {
		// Events are stored from starting index 15 to till valid event ids length
		uint256[] memory eventIds = new uint256[](VALID_EVENT_IDS.length);
		for (uint256 i = 0; i < VALID_EVENT_IDS.length; i++) {
			eventIds[i] = _pubSignals[15 + i];
		}
		return eventIds;
	}

	function getSignerFromPublicSignals(
		uint256[38] memory _pubSignals
	) public pure returns (uint256[2] memory) {
		uint256[2] memory signer;
		signer[0] = _pubSignals[13];
		signer[1] = _pubSignals[14];
		return signer;
	}
}
