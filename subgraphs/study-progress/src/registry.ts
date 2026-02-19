import { StudySetRegistered } from '../generated/StudySetRegistryV1/StudySetRegistryV1'
import { StudySetAnchor } from '../generated/schema'

export function handleStudySetRegistered(event: StudySetRegistered): void {
  const id = event.params.studySetKey.toHexString()
  if (StudySetAnchor.load(id) != null) {
    return
  }

  const anchor = new StudySetAnchor(id)
  anchor.studySetKey = event.params.studySetKey

  anchor.trackId = event.params.trackId
  anchor.langHash = event.params.langHash
  anchor.version = event.params.version
  anchor.studySetRef = event.params.studySetRef
  anchor.studySetHash = event.params.studySetHash
  anchor.submitter = event.params.submitter
  anchor.paidBy = event.params.paidBy
  anchor.createdAtBlockNumber = event.block.number
  anchor.createdAtBlockTimestamp = event.block.timestamp
  anchor.createdAtLogIndex = event.logIndex
  anchor.transactionHash = event.transaction.hash
  anchor.save()
}
