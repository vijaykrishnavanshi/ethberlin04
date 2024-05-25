"use client";

import { useCallback, useState } from "react";
import { ZKEdDSAEventTicketPCDPackage } from "@pcd/zk-eddsa-event-ticket-pcd";
import { zuAuthPopup } from "@pcd/zuauth";
import type { NextPage } from "next";
import { hexToBigInt } from "viem";
import { useAccount } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { generateWitness, isETHBerlinPublicKey } from "~~/utils/scaffold-eth/pcd";
import { ETHBERLIN_ZUAUTH_CONFIG } from "~~/utils/zupassConstants";

// Get a valid event id from { supportedEvents } from "zuauth" or https://api.zupass.org/issue/known-ticket-types
const fieldsToReveal = {
  revealAttendeeEmail: true,
  revealEventId: true,
  revealProductId: true,
};

const Home: NextPage = () => {
  const [verifiedFrontend, setVerifiedFrontend] = useState(false);
  const [verifiedBackend, setVerifiedBackend] = useState(false);
  const [verifiedOnChain, setVerifiedOnChain] = useState(false);
  const { address: connectedAddress } = useAccount();
  const [pcd, setPcd] = useState<string>();

  const getProof = useCallback(async () => {
    if (!connectedAddress) {
      notification.error("Please connect wallet");
      return;
    }
    const result = await zuAuthPopup({ fieldsToReveal, watermark: connectedAddress, config: ETHBERLIN_ZUAUTH_CONFIG });
    if (result.type === "pcd") {
      setPcd(JSON.parse(result.pcdStr).pcd);
    } else {
      notification.error("Failed to parse PCD");
    }
  }, [connectedAddress]);

  const verifyProofFrontend = async () => {
    if (!pcd) {
      notification.error("No PCD found!");
      return;
    }

    if (!connectedAddress) {
      notification.error("Please connect wallet");
      return;
    }
    const deserializedPCD = await ZKEdDSAEventTicketPCDPackage.deserialize(pcd);

    if (!(await ZKEdDSAEventTicketPCDPackage.verify(deserializedPCD))) {
      notification.error(`[ERROR Frontend] ZK ticket PCD is not valid`);
      return;
    }

    if (!isETHBerlinPublicKey(deserializedPCD.claim.signer)) {
      notification.error(`[ERROR Frontend] PCD is not signed by ETHBerlin`);
      return;
    }

    if (deserializedPCD.claim.watermark.toString() !== hexToBigInt(connectedAddress as `0x${string}`).toString()) {
      notification.error(`[ERROR Frontend] PCD watermark doesn't match`);
      return;
    }

    setVerifiedFrontend(true);
    notification.success(
      <>
        <p className="font-bold m-0">Frontend Verified!</p>
        <p className="m-0">
          The proof has been verified
          <br /> by the frontend.
        </p>
      </>,
    );
  };

  const sendPCDToServer = async () => {
    let response;
    try {
      response = await fetch("/api/verify", {
        method: "POST",
        body: JSON.stringify({
          pcd: pcd,
          address: connectedAddress,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (e) {
      notification.error(`Error: ${e}`);
      return;
    }

    const data = await response.json();
    setVerifiedBackend(true);
    notification.success(
      <>
        <p className="font-bold m-0">Backend Verified!</p>
        <p className="m-0">{data?.message}</p>
      </>,
    );
  };

  // mintItem verifies the proof on-chain and mints an NFT
  const { writeContractAsync: mintNFT, isPending: isMintingNFT } = useScaffoldWriteContract("YourCollectible");

  const { data: yourBalance } = useScaffoldReadContract({
    contractName: "YourCollectible",
    functionName: "balanceOf",
    args: [connectedAddress],
  });

  return (
    <>
      <div className="flex flex-col items-center mt-24">
        <div className="card max-w-[90%] sm:max-w-lg bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Zupass: Scaffold-ETH 2 Starter Kit</h2>
            <p className="mt-0">
              Get started with{" "}
              <a className="link" href="https://github.com/proofcarryingdata/zupass" target="_blank">
                Zupass
              </a>{" "}
              to verify PCDs (Proof-Carrying Data). <span className="font-bold">e.g.</span> ETHBerlin tickets.
            </p>
            <p className="text-sm m-0">
              - Check
              <code className="mx-1 px-1 italic bg-base-300 font-bold max-w-full break-words break-all inline-block">
                packages/nextjs/pages/index.tsx
              </code>
              to learn how to ask Zupass for a zero knowledge proof.
            </p>
            <p className="text-sm m-0">
              - Check
              <code className="mx-1 px-1 italic bg-base-300 font-bold max-w-full break-words break-all inline-block">
                packages/nextjs/pages/api/verify.tsx
              </code>
              to learn how to verify the proof on the backend and execute any action (in this example it will send 1 ETH
              to the connected address).
            </p>
            <div className="flex flex-col gap-4 mt-6">
              <div className="tooltip" data-tip="Loads the Zupass UI in a modal, where you can prove your PCD.">
                <button className="btn btn-secondary w-full tooltip" onClick={getProof} disabled={!!pcd}>
                  {!pcd ? "1. Get Proof" : "1. Proof Received!"}
                </button>
              </div>
              <div className="tooltip" data-tip="When you get back the PCD, verify it on the frontend.">
                <button
                  className="btn btn-primary w-full"
                  disabled={!pcd || verifiedFrontend}
                  onClick={verifyProofFrontend}
                >
                  2. Verify (frontend)
                </button>
              </div>
              <div className="tooltip" data-tip="Send the PCD to the server to verify it and execute any action.">
                <button
                  className="btn btn-primary w-full"
                  disabled={!verifiedFrontend || verifiedBackend}
                  onClick={sendPCDToServer}
                >
                  3. Verify (backend) and send ETH
                </button>
              </div>
              <div className="tooltip" data-tip="Submit the proof to a smart contract to verify it on-chain.">
                <button
                  className="btn btn-primary w-full"
                  disabled={!verifiedBackend || verifiedOnChain}
                  onClick={async () => {
                    try {
                      await mintNFT({
                        functionName: "mintItem",
                        // @ts-ignore TODO: fix the type later with readonly fixed length bigInt arrays
                        args: [pcd ? generateWitness(JSON.parse(pcd)) : undefined],
                      });
                    } catch (e) {
                      notification.error(`Error: ${e}`);
                      return;
                    }
                    setVerifiedOnChain(true);
                  }}
                >
                  {isMintingNFT ? <span className="loading loading-spinner"></span> : "4. Verify (on-chain) and mint"}
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  className="btn btn-ghost text-error underline normal-case"
                  onClick={() => {
                    setVerifiedFrontend(false);
                  }}
                >
                  Reset
                </button>
              </div>
              <div className="text-center text-xl">
                {yourBalance && yourBalance >= 1n ? "🎉 🍾 proof verified in contract!!! 🥂 🎊" : ""}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
