import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { AttemptSubmitted } from '../generated/StudyAttemptsV1/StudyAttemptsV1'
import {
  StudyAttempt,
  UserStudySetProgress,
  UserStudySetQuestionTouch,
} from '../generated/schema'

const CANONICAL_ORDER_SCALE = BigInt.fromI32(1_000_000)

function toUserStudySetId(user: string, studySetKey: string): string {
  return `${user.toLowerCase()}-${studySetKey.toLowerCase()}`
}

function toQuestionTouchId(user: string, studySetKey: string, questionId: string): string {
  return `${user.toLowerCase()}-${studySetKey.toLowerCase()}-${questionId.toLowerCase()}`
}

function computeCanonicalOrder(blockNumber: BigInt, logIndex: BigInt): BigInt {
  return blockNumber.times(CANONICAL_ORDER_SCALE).plus(logIndex)
}

function toAverage(totalScore: BigInt, totalAttempts: i32): BigDecimal {
  if (totalAttempts <= 0) {
    return BigDecimal.zero()
  }
  return totalScore.toBigDecimal().div(BigDecimal.fromString(totalAttempts.toString()))
}

export function handleAttemptSubmitted(event: AttemptSubmitted): void {
  const userHex = event.params.user.toHexString()
  const studySetKeyHex = event.params.studySetKey.toHexString()
  const questionIdHex = event.params.questionId.toHexString()

  const attemptId = `${event.transaction.hash.toHexString()}-${event.logIndex.toString()}`
  const userStudySetId = toUserStudySetId(userHex, studySetKeyHex)
  const canonicalOrder = computeCanonicalOrder(event.block.number, event.logIndex)

  let progress = UserStudySetProgress.load(userStudySetId)
  if (progress == null) {
    progress = new UserStudySetProgress(userStudySetId)
    progress.user = event.params.user
    progress.studySetKey = event.params.studySetKey
    progress.totalAttempts = 0
    progress.uniqueQuestionsTouched = 0
    progress.correctAttempts = 0
    progress.incorrectAttempts = 0
    progress.totalScore = BigInt.zero()
    progress.averageScore = BigDecimal.zero()
    progress.latestCanonicalOrder = BigInt.zero()
    progress.latestBlockNumber = BigInt.zero()
    progress.latestBlockTimestamp = BigInt.zero()
    progress.latestLogIndex = BigInt.zero()
  }

  const attempt = new StudyAttempt(attemptId)
  attempt.userStudySet = userStudySetId
  attempt.user = event.params.user
  attempt.studySetKey = event.params.studySetKey
  attempt.questionId = event.params.questionId
  attempt.rating = event.params.rating
  attempt.score = event.params.score
  attempt.clientTimestamp = event.params.timestamp
  attempt.canonicalOrder = canonicalOrder
  attempt.blockNumber = event.block.number
  attempt.blockTimestamp = event.block.timestamp
  attempt.logIndex = event.logIndex
  attempt.transactionHash = event.transaction.hash
  attempt.save()

  progress.totalAttempts = progress.totalAttempts + 1
  progress.totalScore = progress.totalScore.plus(BigInt.fromI32(event.params.score))
  progress.averageScore = toAverage(progress.totalScore, progress.totalAttempts)

  if (event.params.score == 10_000) {
    progress.correctAttempts = progress.correctAttempts + 1
  } else {
    progress.incorrectAttempts = progress.incorrectAttempts + 1
  }

  if (canonicalOrder.ge(progress.latestCanonicalOrder)) {
    progress.latestCanonicalOrder = canonicalOrder
    progress.latestBlockNumber = event.block.number
    progress.latestBlockTimestamp = event.block.timestamp
    progress.latestLogIndex = event.logIndex
  }

  const touchId = toQuestionTouchId(userHex, studySetKeyHex, questionIdHex)
  let touch = UserStudySetQuestionTouch.load(touchId)
  if (touch == null) {
    touch = new UserStudySetQuestionTouch(touchId)
    touch.user = event.params.user
    touch.studySetKey = event.params.studySetKey
    touch.questionId = event.params.questionId
    touch.firstAttempt = attempt.id
    touch.firstCanonicalOrder = canonicalOrder
    touch.blockNumber = event.block.number
    touch.blockTimestamp = event.block.timestamp
    touch.logIndex = event.logIndex
    touch.transactionHash = event.transaction.hash
    touch.save()

    progress.uniqueQuestionsTouched = progress.uniqueQuestionsTouched + 1
  }

  progress.save()
}
