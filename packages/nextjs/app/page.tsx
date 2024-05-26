"use client";

import { useCallback, useState } from "react";
import { zuAuthPopup } from "@pcd/zuauth";
import type { NextPage } from "next";
import { ENTRYPOINT_ADDRESS_V07, createSmartAccountClient } from "permissionless";
import { signerToSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoBundlerClient, createPimlicoPaymasterClient } from "permissionless/clients/pimlico";
import { createPublicClient, encodeFunctionData, http, toBytes, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { generateWitness } from "~~/utils/scaffold-eth/pcd";
import { ETHBERLIN_ZUAUTH_CONFIG } from "~~/utils/zupassConstants";

const publicClient = createPublicClient({
  transport: http("https://rpc.ankr.com/eth_sepolia"),
});

const paymasterClient = createPimlicoPaymasterClient({
  transport: http(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`),
  entryPoint: ENTRYPOINT_ADDRESS_V07,
});

const pimlicoBundlerClient = createPimlicoBundlerClient({
  transport: http(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`),
  entryPoint: ENTRYPOINT_ADDRESS_V07,
});

const PortalABI = [
  {
    inputs: [
      {
        internalType: "string",
        name: "_metadataIPFSHash",
        type: "string",
      },
      {
        internalType: "string",
        name: "_ownerViewDid",
        type: "string",
      },
      {
        internalType: "string",
        name: "_ownerEditDid",
        type: "string",
      },
      {
        internalType: "address",
        name: "owner",
        type: "address",
      },
      {
        internalType: "address",
        name: "_trustedForwarder",
        type: "address",
      },
      {
        components: [
          {
            internalType: "bytes32",
            name: "portalEncryptionKeyVerifier",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "portalDecryptionKeyVerifier",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "memberEncryptionKeyVerifier",
            type: "bytes32",
          },
          {
            internalType: "bytes32",
            name: "memberDecryptionKeyVerifier",
            type: "bytes32",
          },
        ],
        internalType: "struct PortalKeyVerifiers.KeyVerifier",
        name: "_keyVerifier",
        type: "tuple",
      },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "by",
        type: "address",
      },
    ],
    name: "AddedCollaborator",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "fileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "metadataIPFSHash",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "contentIPFSHash",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "gateIPFSHash",
        type: "string",
      },
      {
        indexed: true,
        internalType: "address",
        name: "by",
        type: "address",
      },
    ],
    name: "AddedFile",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "fileId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "metadataIPFSHash",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "contentIPFSHash",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "gateIPFSHash",
        type: "string",
      },
      {
        indexed: true,
        internalType: "address",
        name: "by",
        type: "address",
      },
    ],
    name: "EditedFile",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferStarted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "previousOwner",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "RegisteredCollaboratorKeys",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
      {
        indexed: true,
        internalType: "address",
        name: "by",
        type: "address",
      },
    ],
    name: "RemovedCollaborator",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "RemovedCollaboratorKeys",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "bytes32",
        name: "portalEncryptionKeyVerifier",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "portalDecryptionKeyVerifier",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "memberEncryptionKeyVerifier",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "memberDecryptionKeyVerifier",
        type: "bytes32",
      },
    ],
    name: "UpdatedKeyVerifiers",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "string",
        name: "metadataIPFSHash",
        type: "string",
      },
      {
        indexed: true,
        internalType: "address",
        name: "by",
        type: "address",
      },
    ],
    name: "UpdatedPortalMetadata",
    type: "event",
  },
  {
    inputs: [],
    name: "acceptOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "collaborator",
        type: "address",
      },
    ],
    name: "addCollaborator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "_metadataIPFSHash",
        type: "string",
      },
      {
        internalType: "string",
        name: "_contentIPFSHash",
        type: "string",
      },
      {
        internalType: "string",
        name: "_gateIPFSHash",
        type: "string",
      },
      {
        internalType: "enum FileversePortal.FileType",
        name: "filetype",
        type: "uint8",
      },
      {
        internalType: "uint256",
        name: "version",
        type: "uint256",
      },
    ],
    name: "addFile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    name: "collaboratorKeys",
    outputs: [
      {
        internalType: "string",
        name: "viewDid",
        type: "string",
      },
      {
        internalType: "string",
        name: "editDid",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "fileId",
        type: "uint256",
      },
      {
        internalType: "string",
        name: "_metadataIPFSHash",
        type: "string",
      },
      {
        internalType: "string",
        name: "_contentIPFSHash",
        type: "string",
      },
      {
        internalType: "string",
        name: "_gateIPFSHash",
        type: "string",
      },
      {
        internalType: "enum FileversePortal.FileType",
        name: "filetype",
        type: "uint8",
      },
      {
        internalType: "uint256",
        name: "version",
        type: "uint256",
      },
    ],
    name: "editFile",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "files",
    outputs: [
      {
        internalType: "string",
        name: "metadataIPFSHash",
        type: "string",
      },
      {
        internalType: "string",
        name: "contentIPFSHash",
        type: "string",
      },
      {
        internalType: "string",
        name: "gateIPFSHash",
        type: "string",
      },
      {
        internalType: "enum FileversePortal.FileType",
        name: "fileType",
        type: "uint8",
      },
      {
        internalType: "uint256",
        name: "version",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCollaboratorCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCollaboratorKeysCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCollaborators",
    outputs: [
      {
        internalType: "address[]",
        name: "",
        type: "address[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getFileCount",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "isCollaborator",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "forwarder",
        type: "address",
      },
    ],
    name: "isTrustedForwarder",
    outputs: [
      {
        internalType: "bool",
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "keyVerifiers",
    outputs: [
      {
        internalType: "bytes32",
        name: "portalEncryptionKeyVerifier",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "portalDecryptionKeyVerifier",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "memberEncryptionKeyVerifier",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "memberDecryptionKeyVerifier",
        type: "bytes32",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "metadataIPFSHash",
    outputs: [
      {
        internalType: "string",
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pendingOwner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "viewDid",
        type: "string",
      },
      {
        internalType: "string",
        name: "editDid",
        type: "string",
      },
    ],
    name: "registerCollaboratorKeys",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "prevCollaborator",
        type: "address",
      },
      {
        internalType: "address",
        name: "collaborator",
        type: "address",
      },
    ],
    name: "removeCollaborator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "removeCollaboratorKeys",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "renounceOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "portalEncryptionKeyVerifier",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "portalDecryptionKeyVerifier",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "memberEncryptionKeyVerifier",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "memberDecryptionKeyVerifier",
        type: "bytes32",
      },
    ],
    name: "updateKeyVerifiers",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "string",
        name: "_metadataIPFSHash",
        type: "string",
      },
    ],
    name: "updateMetadata",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// Get a valid event id from { supportedEvents } from "zuauth" or https://api.zupass.org/issue/known-ticket-types
const fieldsToReveal = {
  revealEventId: true,
  revealProductId: true,
};

const Home: NextPage = () => {
  const [identityCreated, setIdentityCreated] = useState(false);
  const [fileUploaded] = useState(false);
  const [addedCommunityContributor, setAddedCommunityContributor] = useState(false);
  const { address: connectedAddress } = useAccount();
  const [identityAddress, setIdentityAddress] = useState<null | string>(null);
  const [pcd, setPcd] = useState<string>();
  const signer = privateKeyToAccount(generatePrivateKey());

  const getProof = useCallback(async () => {
    if (!connectedAddress) {
      notification.error("Please connect wallet");
      return;
    }
    const result = await zuAuthPopup({ fieldsToReveal, watermark: 12345n, config: ETHBERLIN_ZUAUTH_CONFIG });
    if (result.type === "pcd") {
      setPcd(JSON.parse(result.pcdStr).pcd);
    } else {
      notification.error("Failed to parse PCD");
    }
  }, [connectedAddress]);

  const safeAccount = useCallback(async () => {
    return await signerToSafeSmartAccount(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      signer: signer,
      safeVersion: "1.4.1",
    });
  }, [signer]);

  // mintItem verifies the proof on-chain and mints an NFT
  const { writeContractAsync: addCollborator, isPending: isAddingCollborator } =
    useScaffoldWriteContract("CommunityPortal");

  const { data: communityPortalAddress } = useScaffoldReadContract({
    contractName: "CommunityPortal",
    functionName: "communityPortal",
  });

  const createSmartAccount = async () => {
    const account = await safeAccount();
    return createSmartAccountClient({
      account,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      chain: sepolia,
      bundlerTransport: http(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`),
      middleware: {
        sponsorUserOperation: paymasterClient.sponsorUserOperation, // optional
        gasPrice: async () => (await pimlicoBundlerClient.getUserOperationGasPrice()).fast, // if using pimlico bundler
      },
    });
  };

  // @ts-ignore
  const getCallData = async ({ metadataIPFSHash, contentIPFSHash, fileType, safeAccount }) => {
    const callData = await safeAccount.encodeCallData({
      to: communityPortalAddress,
      data: encodeFunctionData({
        abi: PortalABI,
        functionName: "addFile",
        args: [metadataIPFSHash, contentIPFSHash, , fileType, 0],
      }),
      value: BigInt(0),
    });
    return callData;
  };

  const uploadFile = async () => {
    const account = await safeAccount();
    const callData = await getCallData({
      safeAccount: account,
      metadataIPFSHash: "QmbgqqoYHAMbZT3SUrcZDvqoxgA2o2Gd6db4G2cu5gVVTu",
      contentIPFSHash: "QmYtiLzEhaJafgiBWTAYqkgd61wmtnV5p77Y2scBhyNXbF",
      fileType: 0,
    });
    console.log(callData);
    const gasPrices = await pimlicoBundlerClient.getUserOperationGasPrice();

    const userOperation = await createSmartAccount();

    console.log({ userOperation, gasPrices });

    const res = await userOperation.prepareUserOperationRequest({
      userOperation: {
        callData, // callData is the only required field in the partial user operation
        nonce: toHex(toBytes(generatePrivateKey()).slice(0, 24), { size: 32 }) as any,
        maxFeePerGas: gasPrices.fast.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
      },
      account,
    });

    console.log(res);

    res.signature = await account.signUserOperation(res);
    const txnHash = await userOperation.sendUserOperation({ userOperation: res });
    console.log(txnHash);
  };

  return (
    <div className="flex flex-col items-center mt-24">
      <div className="card max-w-[90%] sm:max-w-lg bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Community Identity for Collaboration</h2>
          <div className="flex flex-col gap-4 mt-6">
            <div className="tooltip" data-tip="Loads the Zupass UI in a modal, where you can prove your PCD.">
              <button className="btn btn-primary w-full tooltip" onClick={getProof} disabled={!!pcd}>
                {!pcd ? "1. Get Proof" : "1. Proof Received!"}
              </button>
            </div>
            <div className="tooltip" data-tip="Create a new identity to get access to community archive portal">
              <button
                className="btn btn-primary w-full"
                disabled={!pcd || identityCreated}
                onClick={async () => {
                  try {
                    const res = await safeAccount();
                    setIdentityCreated(true);
                    setIdentityAddress(res.address);
                  } catch (e) {
                    console.log(e);
                  }
                }}
              >
                {"2. Create New Identity"}
              </button>
            </div>
            <div
              className="tooltip"
              data-tip="Submit the proof to a smart contract to verify it on-chain and get added as a collaborator to community portal."
            >
              <button
                className="btn btn-primary w-full"
                disabled={!pcd || addedCommunityContributor}
                onClick={async () => {
                  try {
                    await addCollborator({
                      functionName: "addCommunityCollaborator",
                      // @ts-ignore TODO: fix the type later with readonly fixed length bigInt arrays
                      args: [pcd ? generateWitness(JSON.parse(pcd)) : undefined, identityAddress],
                    });
                  } catch (e) {
                    notification.error(`Error: ${e}`);
                    return;
                  }
                  setAddedCommunityContributor(true);
                }}
              >
                {isAddingCollborator ? (
                  <span className="loading loading-spinner"></span>
                ) : (
                  "3. Verify (on-chain) and add community collaborator"
                )}
              </button>
            </div>
            <div className="tooltip" data-tip="Upload file and put it on community portal">
              <button
                className="btn btn-primary w-full"
                disabled={!pcd || fileUploaded}
                onClick={async () => {
                  try {
                    await uploadFile();
                  } catch (e) {
                    console.log(e);
                  }
                }}
              >
                {"4. Add to community archive"}
              </button>
            </div>
            <div className="flex justify-center">
              <button
                className="btn btn-ghost text-error underline normal-case"
                onClick={() => {
                  setAddedCommunityContributor(false);
                }}
              >
                Reset
              </button>
            </div>
            <div className="text-center text-xl">
              {communityPortalAddress ? `🍾 Community Portal Address: ${communityPortalAddress}! 🥂 🎊` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
