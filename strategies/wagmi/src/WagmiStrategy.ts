import {
  connect,
  disconnect,
  getAccount,
  reconnect,
  watchAccount,
} from "@wagmi/core";
import { DataItem, DispatchResult } from "arconnect";
import { SignatureOptions } from "arweave/node/lib/crypto/crypto-interface";
import Transaction from "arweave/node/lib/transaction";
import { ethers } from "ethers";
import { Config as WagmiConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { encrypt } from "@metamask/eth-sig-util";

import {
  createWagmiDataItemSigner,
  getEthersPublicKeyFromClient,
  getEthersSigner,
} from "./utils/ethereum.js";
import Strategy from "@arweave-wallet-kit/core/src/strategy/Strategy.js";
import { AoSigner } from "@arweave-wallet-kit/core/src/wallet/types.js";
import { PermissionType } from "@arweave-wallet-kit/core/wallet";

export type WagmiStrategyOptions = {
  id: string;
  name: string;
  description: string;
  theme: string;
  logo: string;
  wagmiConfig: WagmiConfig;
};

export class WagmiStrategy implements Strategy {
  public id: string;
  public name: string;
  public description: string;
  public theme: string; // Customize as needed
  public logo: string; // arweave tx id of the logo
  public config: WagmiConfig;
  public signer: ethers.Signer | null = null;
  public account: string | null = null;
  private unsubscribeAccount: null | (() => void) = null;

  constructor({
    id,
    name,
    description,
    theme,
    logo,
    wagmiConfig,
  }: WagmiStrategyOptions) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.theme = theme;
    this.logo = logo;
    this.config = wagmiConfig;

    this.sync();
    // Set up listeners for signer and account changes
    this.setupListeners();
  }

  private setupListeners() {
    // Subscribe to account changes
    this.unsubscribeAccount = this.config.subscribe(
      (state) => state,
      (current) => {
        let newAccount: null | `0x${string}` = null;
        if (current.current) {
          newAccount =
            current.connections.get(current.current)?.accounts[0] ?? null;
        }
        this.account = newAccount;

        // Update signer when account changes
        if (this.account) {
          getEthersSigner(this.config)
            .then((signer) => {
              this.signer = signer;
            })
            .catch(console.error);
        } else {
          this.signer = null;
        }
      },
    );
  }

  public cleanupListeners() {
    if (this.unsubscribeAccount) {
      this.unsubscribeAccount();
    }
  }

  public async isAvailable(): Promise<boolean> {
    const { ethereum } = window;
    if (!ethereum) {
      console.error(
        `[Arweave Wallet Kit] "${this.id}" strategy is unavailable. window.ethereum is undefined.`,
      );
      return false;
    } else return true;
  }

  public async sync(): Promise<void> {
    // Optional sync method depending on your strategy's needs
    await reconnect(this.config, {
      connectors: [injected({ target: "metaMask" })],
    });
    // Update signer when account changes
    if (this.account) {
      getEthersSigner(this.config)
        .then((signer) => {
          this.signer = signer;
        })
        .catch(console.error);
    } else {
      this.signer = null;
    }
  }

  public async connect(): Promise<void> {
    try {
      // Use injected connector for MetaMask or other injected wallets
      const account = await connect(this.config, {
        connector: injected({ target: "metaMask", shimDisconnect: true }),
      });
      this.account = account.accounts[0];
      this.signer = await getEthersSigner(this.config);
    } catch (error) {
      console.error(`[Arweave Wallet Kit] Error connecting to wallet:`, error);
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await disconnect?.(this.config);
      this.account = null;
      this.signer = null;
    } catch (error) {
      console.error(`[Arweave Wallet Kit] Error disconnecting:`, error);
    }
  }

  public async getActiveAddress(): Promise<string> {
    return this.account ?? "";
  }

  public async getActivePublicKey(): Promise<string> {
    return getEthersPublicKeyFromClient(this.config);
  }

  public async getAllAddresses(): Promise<string[]> {
    const accounts = getAccount(this.config).addresses;
    return (accounts ?? []) as string[];
  }

  public async signMessage(message: string): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer not available");
    }
    return await this.signer.signMessage(message);
  }

  public async signTransaction(
    transaction: ethers.TransactionRequest,
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer not available");
    }
    const txResponse = await this.signer.sendTransaction(transaction);
    return txResponse.hash;
  }

  public async signDataItem(dataItem: DataItem): Promise<ArrayBuffer> {
    if (!this.signer) {
      throw new Error("Signer not available");
    }
    const dataItemSigner = await this.createDataItemSigner();
    return dataItemSigner(dataItem).then(
      (res) => res.raw,
    ) as unknown as ArrayBuffer;
  }
  public addAddressEvent(listener: (address: string) => void) {
    // Subscribe to account changes
    const unsubscribe = this.config.subscribe(
      (state) => state,
      (current) => {
        //  console.log(current);
        if (current?.current) {
          const newAccount =
            current.connections.get(current.current)?.accounts[0] ?? null;
          if (newAccount) listener(newAccount);
        }
      },
    );

    // Return the unsubscribe function to allow cleaning up the event listener if needed
    // eslint-disable-next-line
    return (e: CustomEvent<{ address: string }>) => unsubscribe();
  }

  public removeAddressEvent(
    listener: (e: CustomEvent<{ address: string }>) => void,
  ) {
    listener(new CustomEvent(this.account ?? ""));
  }

  public async encrypt(data: BufferSource): Promise<Uint8Array> {
    const signer = await getEthersSigner(this.config);
    const publicKey = await signer.provider.send("eth_getEncryptionPublicKey", [
      this.account,
    ]);
    const stringData = new TextDecoder().decode(data);
    const encryptedData = encrypt({
      data: stringData,
      publicKey: publicKey,
      version: "x25519-xsalsa20-poly1305",
    });
    return new TextEncoder().encode(JSON.stringify(encryptedData));
  }
  public async decrypt(data: BufferSource): Promise<Uint8Array> {
    const signer = await getEthersSigner(this.config);
    const address = await this.getActiveAddress();
    // doing all this bullshit to avoid use of buffer
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const hexData = `0x${Array.from(encoder.encode(decoder.decode(data)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
    return signer.provider.send("eth_decrypt", [hexData, address]);
  }

  // unused apis, no need to lint - remove when used
  /* eslint-disable */
  public async getPermissions(): Promise<PermissionType[]> {
    return [
      "ACCESS_ADDRESS",
      "ACCESS_PUBLIC_KEY",
      "ACCESS_ALL_ADDRESSES",
      "SIGN_TRANSACTION",
      "ENCRYPT",
      "DECRYPT",
      "SIGNATURE",
      "ACCESS_ARWEAVE_CONFIG",
      "DISPATCH",
      "ACCESS_TOKENS",
    ] as PermissionType[];
  }
  public async dispatch(transaction: Transaction): Promise<DispatchResult> {
    throw new Error("Method not available on ethereum wallets.");
  }
  public async addToken(address: string): Promise<void> {
    throw new Error("Method not available on ethereum wallets");
  }
  public async sign(
    transaction: Transaction,
    options?: SignatureOptions,
  ): Promise<Transaction> {
    throw new Error(
      "Method not available on ethereum wallets - use signDataItem instead",
    );
  }
  public async getWalletNames(): Promise<{ [addr: string]: string }> {
    throw new Error("Method not available on ethereum wallets.");
  }
  public async createDataItemSigner(): Promise<AoSigner> {
    return createWagmiDataItemSigner(this.config);
  }
}
