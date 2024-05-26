"use client";

import { useCallback, useState } from "react";
import { CommunityPortalABI, PortalABI } from "./abis";
import { zuAuthPopup } from "@pcd/zuauth";
import type { NextPage } from "next";
import { ENTRYPOINT_ADDRESS_V07, createSmartAccountClient } from "permissionless";
import { signerToSafeSmartAccount } from "permissionless/accounts";
import { createPimlicoBundlerClient, createPimlicoPaymasterClient } from "permissionless/clients/pimlico";
import { createPublicClient, encodeFunctionData, http, toBytes, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { generateWitness } from "~~/utils/scaffold-eth/pcd";
import { ETHBERLIN_ZUAUTH_CONFIG } from "~~/utils/zupassConstants";

export const publicClient = createPublicClient({
  transport: http("https://rpc.ankr.com/eth_sepolia"),
});

export const paymasterClient = createPimlicoPaymasterClient({
  transport: http(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`),
  entryPoint: ENTRYPOINT_ADDRESS_V07,
});

export const pimlicoBundlerClient = createPimlicoBundlerClient({
  transport: http(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`),
  entryPoint: ENTRYPOINT_ADDRESS_V07,
});

// Get a valid event id from { supportedEvents } from "zuauth" or https://api.zupass.org/issue/known-ticket-types
const fieldsToReveal = {
  revealEventId: true,
  revealProductId: true,
};

const Home: NextPage = () => {
  const [identityCreated, setIdentityCreated] = useState(false);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [addedCommunityContributor, setAddedCommunityContributor] = useState(false);
  const { address: connectedAddress } = useAccount();
  const [identityAddress, setIdentityAddress] = useState<null | string>(null);
  const [pcd, setPcd] = useState<string>();
  const [logArray, setLogArray] = useState<string[]>([]);
  const signer = privateKeyToAccount(generatePrivateKey());

  const getProof = useCallback(async () => {
    if (!connectedAddress) {
      notification.error("Please connect wallet");
      return;
    }
    setLogArray([...logArray, 'Requested PCD']);
    const result = await zuAuthPopup({ fieldsToReveal, watermark: 12345n, config: ETHBERLIN_ZUAUTH_CONFIG });
    if (result.type === "pcd") {
      setPcd(JSON.parse(result.pcdStr).pcd);
      setLogArray([...logArray, 'Recieved PCD Successfully']);
    } else {
      notification.error("Failed to parse PCD");
    }
  }, [connectedAddress]);

  const safeAccount = useCallback(async () => {
    const account = await signerToSafeSmartAccount(publicClient, {
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      signer: signer,
      saltNonce: 0n,
      safeVersion: "1.4.1",
    });
    return account;
  }, []);

  const { data: communityPortalAddress } = useScaffoldReadContract({
    contractName: "CommunityPortal",
    functionName: "communityPortal",
  });

  const initialiseSmartAccountClient = async () => {
    const account = await safeAccount();
    console.log(account.address);
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
  const getFileUploadCallData = async ({ metadataIPFSHash, contentIPFSHash, fileType, safeAccount }) => {
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
    const callData = await getFileUploadCallData({
      safeAccount: account,
      metadataIPFSHash: "QmbgqqoYHAMbZT3SUrcZDvqoxgA2o2Gd6db4G2cu5gVVTu",
      contentIPFSHash: "QmYtiLzEhaJafgiBWTAYqkgd61wmtnV5p77Y2scBhyNXbF",
      fileType: 0,
    });
    const gasPrices = await pimlicoBundlerClient.getUserOperationGasPrice();

    const smartAccountClient = await initialiseSmartAccountClient();
    const userOperation = await smartAccountClient.prepareUserOperationRequest({
      userOperation: {
        callData, // callData is the only required field in the partial user operation
        nonce: toHex(toBytes(generatePrivateKey()).slice(0, 24), { size: 32 }),
        maxFeePerGas: gasPrices.fast.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
      },
      account,
    });

    userOperation.signature = await account.signUserOperation(userOperation);
    const txnHash = await smartAccountClient.sendUserOperation({ userOperation });
    console.log('Pimlicon Txn: ', txnHash);
    const receipt = await pimlicoBundlerClient.waitForUserOperationReceipt({
      hash: txnHash,
    });
    const txnLink = `https://sepolia.etherscan.io/tx/${receipt.receipt.transactionHash}`;
    return txnLink;
  };

  const getAddCommunityContributorCallData = async ({ pcd, identityAddress, safeAccount }) => {
    console.log(pcd, identityAddress);
    const callData = await safeAccount.encodeCallData({
      to: '0x5BD8669A700565a5237671ee33A5Cc4cDaBF01bF',
      data: encodeFunctionData({
        abi: CommunityPortalABI,
        functionName: "addCommunityCollaborator",
        args: [pcd, identityAddress],
      }),
      value: BigInt(0),
    });
    return callData;
  };

  const addCommunityContributor = async ({ pcd, identityAddress }) => {
    const account = await safeAccount();
    const callData = await getAddCommunityContributorCallData({
      safeAccount: account,
      pcd,
      identityAddress,
    });
    const gasPrices = await pimlicoBundlerClient.getUserOperationGasPrice();

    const smartAccountClient = await initialiseSmartAccountClient();
    const userOperation = await smartAccountClient.prepareUserOperationRequest({
      userOperation: {
        callData, // callData is the only required field in the partial user operation
        nonce: toHex(toBytes(generatePrivateKey()).slice(0, 24), { size: 32 }),
        maxFeePerGas: gasPrices.fast.maxFeePerGas,
        maxPriorityFeePerGas: gasPrices.fast.maxPriorityFeePerGas,
      },
      account,
    });
    userOperation.signature = await account.signUserOperation(userOperation);
    const txnHash = await smartAccountClient.sendUserOperation({ userOperation });
    console.log('Pimlicon Txn: ', txnHash);
    const receipt = await pimlicoBundlerClient.waitForUserOperationReceipt({
      hash: txnHash,
    });
    const txnLink = `https://sepolia.etherscan.io/tx/${receipt.receipt.transactionHash}`;
    console.log('txn reciept: ', txnLink);
    return txnLink;
  };

  return (
    <div className="flex flex-row items-center w-70 mx-auto mt-24 gap-10">
      <div className="card sm:max-w-lg bg-base-100 shadow-xl">
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
                    setLogArray([...logArray, '[Identity] Generting...']);
                    const res = await safeAccount();
                    setIdentityCreated(true);
                    setIdentityAddress(res.address);
                    setLogArray([...logArray, `[Identity] Generated: ${res.address}`]);
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
                    setLogArray([...logArray, `[Add Collaborator] Adding identity: ${identityAddress}`]);
                    const txnLink = await addCommunityContributor({
                      pcd: pcd ? generateWitness(JSON.parse(pcd)) : undefined,
                      identityAddress,
                    });
                    console.log('added collaborator: ', identityAddress);
                    setLogArray([...logArray, `[Add Collaborator] Txn Link: ${txnLink}`]);
                  } catch (e) {
                    notification.error(`Error: ${e}`);
                    return;
                  }
                  setAddedCommunityContributor(true);
                }}
              >
                {"3. Verify (on-chain) and add community collaborator"}
              </button>
            </div>
            <div className="tooltip flex gap-2" data-tip="Upload file and put it on community portal">
              <select className="select select-bordered w-full max-w-xs">
                <option disabled selected>
                  Select file
                </option>
                <option>File 1</option>
                <option>File 2</option>
              </select>

              <button
                className="btn btn-primary"
                disabled={!pcd || fileUploaded}
                onClick={async () => {
                  try {
                    setLogArray([...logArray, `[Upload File] Uploading....`]);
                    const txnLink = await uploadFile();
                    setLogArray([...logArray, `[Upload File] Txn Link: ${txnLink}`]);
                  } catch (e) {
                    console.log(e);
                  }
                  setFileUploaded(true);
                  console.log('uploaded file');
                }}
              >
                {"4. Add to community archive"}
              </button>
            </div>
            <div className="flex justify-center">
              <button
                className="btn btn-ghost text-error underline normal-case"
                onClick={() => {
                  setFileUploaded(false);
                }}
              >
                Reset
              </button>
            </div>
            <div className="text-center text-md">
              {communityPortalAddress ? `🍾 Community Portal Address: ${communityPortalAddress}! 🥂 🎊` : ""}
            </div>
          </div>
        </div>
      </div>

      {logArray.length > 0 && (
        <div className="card sm:max-w-lg bg-base-100 shadow-xl h-80 w-80">
          <div className="card-body">
            <ul className="flex flex-col gap-2">
              {logArray.map(log => {
                return <li key={log}>{log}</li>;
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
