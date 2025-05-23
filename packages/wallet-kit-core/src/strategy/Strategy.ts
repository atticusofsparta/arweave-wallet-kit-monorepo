import type Transaction from "arweave/web/lib/transaction";

import type {
  AppInfo,
  GatewayConfig,
  DispatchResult,
  DataItem,
} from "arconnect";
import { AoSigner } from "../wallet";
import { PermissionType } from "../wallet";
export default abstract class Strategy {
  // info
  public abstract id: string;
  public abstract name: string;
  public abstract description: string;
  public abstract theme?: string;
  public abstract logo: string;
  public abstract url?: string;

  // restore session from previous connection
  // Arweave.app needs this
  public abstract resumeSession?(): Promise<void>;

  // connection
  public abstract connect(
    permissions: PermissionType[],
    appInfo?: AppInfo,
    gateway?: GatewayConfig,
  ): Promise<void>;
  public abstract disconnect(): Promise<void>;

  // other apis
  public abstract getActiveAddress(): Promise<string>;
  public abstract getAllAddresses(): Promise<string[]>;
  public abstract sign(
    transaction: Transaction,
    options?: any,
  ): Promise<Transaction>;
  public abstract getPermissions(): Promise<PermissionType[]>;
  public abstract getWalletNames?(): Promise<{ [addr: string]: string }>;
  public abstract encrypt?(
    data: BufferSource,
    algorithm: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
  ): Promise<Uint8Array>;
  public abstract decrypt?(
    data: BufferSource,
    algorithm: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams,
  ): Promise<Uint8Array>;
  public abstract getArweaveConfig?(): Promise<GatewayConfig>;
  public abstract signature?(
    data: Uint8Array,
    algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
  ): Promise<Uint8Array>;
  public abstract getActivePublicKey?(): Promise<string>;
  public abstract addToken?(id: string): Promise<void>;
  public abstract dispatch(transaction: Transaction): Promise<DispatchResult>;

  /** Is this strategy available in the current context */
  public abstract isAvailable(): Promise<boolean | string> | boolean | string;

  /** Events */
  public abstract addAddressEvent(
    listener: (address: string) => void,
  ): (e: CustomEvent<{ address: string }>) => void;
  public abstract removeAddressEvent(
    listener: (e: CustomEvent<{ address: string }>) => void,
  ): void;
  public abstract signDataItem(p: DataItem): Promise<ArrayBuffer>;
  public abstract createDataItemSigner(): Promise<AoSigner>;
}
