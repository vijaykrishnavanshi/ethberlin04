// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./FileversePortal.sol";
import "./structs/PortalKeyVerifiers.sol";
import "./Groth16Verifier.sol";

contract CommunityPortal is Groth16Verifier {
    string public constant name = "Community Owned Portal";

    // address of community owned portal
    FileversePortal public immutable communityPortal;
    address public owner;
    address public trustedForwarder = 0x31470b3126DD7cee5ee7591C2cb5142A68F57120;

    // This us the ETHBerlin event UUID converted to bigint
	uint256[1] VALID_EVENT_IDS = [
		111560146890584288369567824893314450802
	];

	// This is hex to bigint conversion for ETHBerlin signer
	uint256[2] ETHBERLIN_SIGNER = [
		13908133709081944902758389525983124100292637002438232157513257158004852609027,
		7654374482676219729919246464135900991450848628968334062174564799457623790084
	];

    struct ProofArgs {
		uint256[2] _pA;
		uint256[2][2] _pB;
		uint256[2] _pC;
		uint256[38] _pubSignals;
	}

    constructor() {
        owner = address(this);
        PortalKeyVerifiers.KeyVerifier memory verifier = PortalKeyVerifiers.KeyVerifier(0x0, 0x0, 0x0, 0x0);
        string memory metadataIPFSHash = "QmNSM3RTrhhtK8UJESTJYBEWygUHV2DPedxDJfHiVphVVB";
        string memory emptyString = "dummyvalue";
        communityPortal = new FileversePortal(
            metadataIPFSHash,
            emptyString,
            emptyString,
            owner,
            trustedForwarder,
            verifier
        );
    }

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

    function addCommunityCollaborator(
        ProofArgs calldata proof,
        address account
    ) 
        public
		verifiedProof(proof)
		validEventIds(proof._pubSignals)
		validSigner(proof._pubSignals)
    {
        communityPortal.addCollaborator(account);
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
