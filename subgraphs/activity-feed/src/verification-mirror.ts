import { BigInt } from "@graphprotocol/graph-ts";
import { Mirrored as MirroredEvent } from "../generated/VerificationMirror/VerificationMirror";
import { UserVerification } from "../generated/schema";

export function handleMirrored(event: MirroredEvent): void {
  let id = event.params.user.toHexString();

  let verification = UserVerification.load(id);
  if (!verification) {
    verification = new UserVerification(id);
  }

  verification.verifiedAt = BigInt.fromI64(event.params.verifiedAt.toI64());
  verification.nationality = event.params.nationality;
  verification.mirroredAt = event.block.timestamp;
  verification.transactionHash = event.transaction.hash;
  verification.save();
}

