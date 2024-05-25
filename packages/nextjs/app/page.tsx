// @ts-nocheck
"use client";

import { useCallback, useState } from "react";
import { zuAuthPopup } from "@pcd/zuauth";
import type { NextPage } from "next";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { signerToSafeSmartAccount } from "permissionless/accounts";
import { createPublicClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { generateWitness } from "~~/utils/scaffold-eth/pcd";
import { ETHBERLIN_ZUAUTH_CONFIG } from "~~/utils/zupassConstants";

const publicClient = createPublicClient({
  transport: http("https://rpc.ankr.com/eth_sepolia"),
});

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
  }, []);

  // mintItem verifies the proof on-chain and mints an NFT
  const { writeContractAsync: addCollborator, isPending: isAddingCollborator } =
    useScaffoldWriteContract("CommunityPortal");

  const { data: communityPortalAddress } = useScaffoldReadContract({
    contractName: "CommunityPortal",
    functionName: "communityPortal",
  });

  return (
    <>
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
                    // try {
                    //   await addCommunityCollaborator();
                    // } catch (e) {
                    //   notification.error(`Error: ${e}`);
                    //   return;
                    // }
                    // setAddedCommunityContributor(true);
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
    </>
  );
};

export default Home;
