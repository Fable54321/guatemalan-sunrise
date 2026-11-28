import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ApiError,
  createInterview,
  type AnswerValue,
  type InterviewSection,
  type InterviewQuestion,
  type PracticalTask,
  type PracticalTaskAnswers,
} from "../../api/candidateInterviews"
import {
  clearInterviewDraft,
  getCachedInterviewFormDefinition,
  getInterviewDraft,
  getPendingInterviews,
  queueInterview,
  saveInterviewDraft,
} from "../../offline/interviewDb"
import { refreshInterviewQuestionsCache } from "../../offline/interviewQuestionsCache"
import { syncPendingInterviews } from "../../offline/syncPendingInterviews"
import {
  archiveInterview,
  archiveInterviewDraft,
  deleteNativeInterviewDraft,
  getNativeInterviewDraft,
  updateNativePackageStatus,
} from "../../native/nativeArchive"

const sectionLabels: Record<string, { title: string; eyebrow: string }> = {
  group_meeting: { title: "Rencontre de groupe", eyebrow: "" },
  general_information: { title: "Informations générales", eyebrow: "Profil du candidat" },
  presentation: { title: "Présentation", eyebrow: "Entrevue individuelle" },
  practical_exercises: { title: "Exercices pratiques", eyebrow: "Mise en situation" },
  motivation: { title: "Motivation", eyebrow: "Projet et objectifs" },
  final_comments: { title: "Commentaires finaux", eyebrow: "Conclusion" },
}

const isEmpty = (value: AnswerValue | undefined) =>
  value === undefined || (typeof value === "string" && value.trim() === "")

const isValidPhone = (phone: string) =>
  phone.trim().length <= 30 && (phone.match(/\d/g)?.length ?? 0) >= 7

const normalizeQuestionText = (text: string) =>
  text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

const mentionsOtherJob = (question: InterviewQuestion) => {
  const text = normalizeQuestionText(question.question_text)
  const describesAdditionalJob = ["autre", "ailleurs", "second", "deuxieme"]
    .some((term) => text.includes(term))
  return describesAdditionalJob && ["emploi", "travail", "metier", "job"]
    .some((term) => text.includes(term))
}

const isConditionalDetailPrompt = (question: InterviewQuestion) => {
  const text = normalizeQuestionText(question.question_text)
  return text.includes("si oui")
}

function findOtherJobDependency(questions: InterviewQuestion[]) {
  const trigger = questions.find(
    (question) => question.answer_type === "boolean" && mentionsOtherJob(question),
  )
  if (!trigger) return null

  const followingTextQuestions = questions
    .filter(
      (question) =>
        question.section_id === trigger.section_id &&
        question.answer_type === "text" &&
        question.display_order > trigger.display_order,
    )
    .sort((left, right) => left.display_order - right.display_order)

  const detail = followingTextQuestions.find(mentionsOtherJob)
    ?? followingTextQuestions.find(isConditionalDetailPrompt)

  return detail ? { triggerId: trigger.id, detailId: detail.id } : null
}

function ratingBounds(question: InterviewQuestion) {
  const options = question.options
  if (!options || Array.isArray(options)) return { min: 1, max: 5 }

  return {
    min: typeof options.min === "number" ? options.min : 1,
    max: typeof options.max === "number" ? options.max : 5,
  }
}

function QuestionField({
  question,
  value,
  error,
  required = question.is_required,
  onChange,
}: {
  question: InterviewQuestion
  value?: AnswerValue
  error?: string
  required?: boolean
  onChange: (value: AnswerValue | undefined) => void
}) {
  const inputId = `question-${question.id}`
  const errorId = `${inputId}-error`
  const { min, max } = ratingBounds(question)

  return (
    <fieldset
      className={`rounded-2xl border bg-white p-5 transition-colors sm:p-6 ${
        error ? "border-red-300" : "border-[#dfe8d8] focus-within:border-[#668f20]"
      }`}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="sr-only">{question.question_text}</legend>
      <div className="mb-4 flex items-start gap-2">
        <label htmlFor={inputId} className="text-base font-semibold leading-6 text-[#24351e]">
          {question.question_text}
        </label>
        {required && (
          <span className="mt-0.5 text-sm font-bold text-[#d95726]" aria-label="requis">*</span>
        )}
      </div>

      {question.answer_type === "boolean" && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Oui", optionValue: true },
            { label: "Non", optionValue: false },
          ].map(({ label, optionValue }) => (
            <button
              key={label}
              id={optionValue ? inputId : undefined}
              type="button"
              onClick={() => onChange(optionValue)}
              aria-pressed={value === optionValue}
              className={`rounded-xl border px-4 py-3 text-sm font-bold transition-all cursor-pointer ${
                value === optionValue
                  ? "border-[#4f7818] bg-[#eef6df] text-[#36530e] shadow-[0_0_0_2px_rgba(102,143,32,0.12)]"
                  : "border-[#d9e3d2] text-[#53634e] hover:border-[#91ad66] hover:bg-[#f8fbf5]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {question.answer_type === "rating" && (
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {Array.from({ length: max - min + 1 }, (_, index) => index + min).map((rating) => (
            <button
              key={rating}
              id={rating === min ? inputId : undefined}
              type="button"
              onClick={() => onChange(rating)}
              aria-label={`Note de ${rating}`}
              aria-pressed={value === rating}
              className={`grid h-12 w-12 place-items-center rounded-xl border text-sm font-extrabold transition-all ${
                value === rating
                  ? "border-[#4f7818] bg-[#5e861b] text-white shadow-[0_6px_18px_rgba(69,105,19,0.22)]"
                  : "border-[#d9e3d2] bg-white text-[#53634e] hover:border-[#91ad66] hover:bg-[#f8fbf5]"
              }`}
            >
              {rating}
            </button>
          ))}
          <span className="self-center pl-1 text-xs font-medium text-[#758271]">
            {min} = faible · {max} = excellent
          </span>
        </div>
      )}

      {question.answer_type === "integer" && (
        <input
          id={inputId}
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
          className="w-full rounded-xl border border-[#d9e3d2] bg-[#fbfcfa] px-4 py-3 text-base text-[#24351e] outline-none transition focus:border-[#668f20] focus:ring-4 focus:ring-[#668f20]/10"
        />
      )}

      {question.answer_type === "select" && (
        <select
          id={inputId}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-[#d9e3d2] bg-[#fbfcfa] px-4 py-3 text-base text-[#24351e] outline-none transition focus:border-[#668f20] focus:ring-4 focus:ring-[#668f20]/10"
        >
          <option value="">Sélectionner une réponse</option>
          {(Array.isArray(question.options) ? question.options : []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      )}

      {question.answer_type === "text" && (
        <textarea
          id={inputId}
          rows={question.section_code === "final_comments" ? 6 : 3}
          maxLength={5000}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ajouter une réponse…"
          className="w-full resize-y rounded-xl border border-[#d9e3d2] bg-[#fbfcfa] px-4 py-3 text-base leading-6 text-[#24351e] outline-none transition placeholder:text-[#99a295] focus:border-[#668f20] focus:ring-4 focus:ring-[#668f20]/10"
        />
      )}

      {error && (
        <p id={errorId} className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p>
      )}
    </fieldset>
  )
}

function PracticalTaskField({
  task,
  value,
  error,
  onChange,
}: {
  task: PracticalTask
  value?: number
  error?: string
  onChange: (value: number) => void
}) {
  const errorId = `practical-task-${task.id}-error`

  return (
    <fieldset
      className={`rounded-2xl border bg-white p-5 transition-colors sm:p-6 ${
        error ? "border-red-300" : "border-[#dfe8d8] focus-within:border-[#668f20]"
      }`}
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-4 text-base font-semibold leading-6 text-[#24351e]">
        {task.description}
      </legend>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            onClick={() => onChange(rating)}
            aria-label={`Note de ${rating} pour ${task.description}`}
            aria-pressed={value === rating}
            className={`grid h-12 w-12 place-items-center rounded-xl border text-sm font-extrabold transition-all ${
              value === rating
                ? "border-[#4f7818] bg-[#5e861b] text-white shadow-[0_6px_18px_rgba(69,105,19,0.22)]"
                : "border-[#d9e3d2] bg-white text-[#53634e] hover:border-[#91ad66] hover:bg-[#f8fbf5]"
            }`}
          >
            {rating}
          </button>
        ))}
        <span className="self-center pl-1 text-xs font-medium text-[#758271]">
          1 = faible · 5 = excellent
        </span>
      </div>
      {error && (
        <p id={errorId} className="mt-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function CandidateInput({
  id,
  label,
  value,
  error,
  onChange,
  required = false,
  type = "text",
  autoComplete,
  placeholder,
  maxLength,
  autoFocus = false,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  required?: boolean
  type?: "text" | "tel"
  autoComplete?: string
  placeholder?: string
  maxLength: number
  autoFocus?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-extrabold text-[#35482e]">
        {label} {required && <span className="text-[#d95726]">*</span>}
      </label>
      <input
        id={id}
        type={type}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        inputMode={type === "tel" ? "tel" : undefined}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-[#fbfcfa] px-4 py-3.5 text-base text-[#24351e] outline-none transition placeholder:text-[#a3aca0] focus:ring-4 focus:ring-[#668f20]/10 ${
          error ? "border-red-300 focus:border-red-400" : "border-[#d9e3d2] focus:border-[#668f20]"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export default function InterviewForm() {
  const [configuredSections, setConfiguredSections] = useState<InterviewSection[]>([])
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [practicalTasks, setPracticalTasks] = useState<PracticalTask[]>([])
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({})
  const [practicalTaskAnswers, setPracticalTaskAnswers] = useState<PracticalTaskAnswers>({})
  const [candidateNumber, setCandidateNumber] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phoneNumber1, setPhoneNumber1] = useState("")
  const [phoneNumber2, setPhoneNumber2] = useState("")
  const [generalInformationComment, setGeneralInformationComment] = useState("")
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pageError, setPageError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [completionStatus, setCompletionStatus] = useState<"saved" | "queued" | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [usingCachedQuestions, setUsingCachedQuestions] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    let active = true

    const loadQuestions = async () => {
      try {
        const definition = await refreshInterviewQuestionsCache()
        if (!active) return
        setConfiguredSections(definition.sections)
        setQuestions(definition.questions)
        setPracticalTasks(definition.practical_tasks)
        setUsingCachedQuestions(false)
        setPageError("")
      } catch (error) {
        if (!active) return

        const cachedDefinition = await getCachedInterviewFormDefinition().catch(() => null)
        if (!active) return

        if (cachedDefinition?.sections.length) {
          setConfiguredSections(cachedDefinition.sections)
          setQuestions(cachedDefinition.questions)
          setPracticalTasks(cachedDefinition.practical_tasks)
          setUsingCachedQuestions(true)
          setPageError("")
          return
        }

        setPageError(
          error instanceof ApiError && error.status === 401
            ? "Votre session a expiré. Veuillez vous reconnecter au portail."
            : error instanceof Error
              ? error.message
              : "Impossible de charger le formulaire.",
        )
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadQuestions()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    getInterviewDraft()
      .then(async (draft) => draft ?? await getNativeInterviewDraft())
      .then((draft) => {
        if (!active || !draft) return
        setCandidateNumber(draft.candidate.candidateNumber)
        setFirstName(draft.candidate.firstName)
        setLastName(draft.candidate.lastName)
        setPhoneNumber1(draft.candidate.phoneNumber1)
        setPhoneNumber2(draft.candidate.phoneNumber2)
        setGeneralInformationComment(draft.generalInformationComment ?? "")
        setAnswers(draft.answers)
        setPracticalTaskAnswers(draft.practicalTaskAnswers ?? {})
        setStep(Math.max(0, draft.step))
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDraftReady(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!draftReady || completionStatus) return

    const saveTimer = window.setTimeout(() => {
      const candidate = {
        candidateNumber,
        firstName,
        lastName,
        phoneNumber1,
        phoneNumber2,
      }
      void Promise.all([saveInterviewDraft({
        candidate: {
          candidateNumber,
          firstName,
          lastName,
          phoneNumber1,
          phoneNumber2,
        },
        answers,
        practicalTaskAnswers,
        generalInformationComment,
        step,
      }), archiveInterviewDraft({
        candidate,
        answers,
        practicalTaskAnswers,
        generalInformationComment,
        step,
      })]).catch(() => undefined)
    }, 400)

    return () => window.clearTimeout(saveTimer)
  }, [
    answers,
    candidateNumber,
    completionStatus,
    draftReady,
    firstName,
    generalInformationComment,
    lastName,
    phoneNumber1,
    phoneNumber2,
    practicalTaskAnswers,
    step,
  ])

  useEffect(() => {
    let active = true

    const refreshPendingCount = async () => {
      const pending = await getPendingInterviews().catch(() => [])
      if (active) setPendingCount(pending.length)
    }

    const sync = async () => {
      if (!navigator.onLine) return
      await syncPendingInterviews().catch(() => undefined)
      await refreshPendingCount()
    }

    const handleOnline = () => {
      setIsOnline(true)
      void sync()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    void refreshPendingCount().then(sync)

    return () => {
      active = false
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const sections = useMemo(() => {
    const sectionIdsWithFields = new Set([
      ...questions.map((question) => question.section_id),
      ...practicalTasks.map((task) => task.section_id),
    ])
    return configuredSections
      .filter((section) => sectionIdsWithFields.has(section.id))
      .sort((left, right) => left.display_order - right.display_order || left.id - right.id)
  }, [configuredSections, practicalTasks, questions])

  const currentSection = step > 0 ? sections[step - 1] : null
  const currentQuestions = currentSection
    ? questions.filter((question) => question.section_id === currentSection.id)
    : []
  const currentPracticalTasks = currentSection
    ? practicalTasks.filter((task) => task.section_id === currentSection.id)
    : []
  const otherJobDependency = useMemo(() => findOtherJobDependency(questions), [questions])
  const otherJobSelected = otherJobDependency
    ? answers[otherJobDependency.triggerId] === true
    : false
  const visibleCurrentQuestions = currentQuestions.filter(
    (question) => question.id !== otherJobDependency?.detailId || otherJobSelected,
  )
  const currentFields: Array<
    | { kind: "question"; field: InterviewQuestion }
    | { kind: "practicalTask"; field: PracticalTask }
  > = [
    ...visibleCurrentQuestions.map((field) => ({ kind: "question" as const, field })),
    ...currentPracticalTasks.map((field) => ({ kind: "practicalTask" as const, field })),
  ].sort((left, right) => {
    const orderDifference = left.field.display_order - right.field.display_order
    if (orderDifference !== 0) return orderDifference
    if (left.kind !== right.kind) return left.kind === "practicalTask" ? -1 : 1
    return String(left.field.id).localeCompare(String(right.field.id))
  })
  const totalSteps = sections.length + 1
 

  const validateCurrentStep = () => {
    const errors: Record<string, string> = {}

    if (step === 0) {
      if (!candidateNumber.trim()) {
        errors.candidate_number = "Entrez le numéro du candidat."
      }
      if (!firstName.trim()) {
        errors.first_name = "Entrez le prénom du candidat."
      }
      if (!lastName.trim()) {
        errors.last_name = "Entrez le nom de famille du candidat."
      }
      if (!phoneNumber1.trim()) {
        errors.phone_number_1 = "Entrez le numéro de téléphone principal."
      } else if (!isValidPhone(phoneNumber1)) {
        errors.phone_number_1 = "Entrez un numéro de téléphone valide."
      }
      if (phoneNumber2.trim() && !isValidPhone(phoneNumber2)) {
        errors.phone_number_2 = "Entrez un numéro de téléphone valide."
      }
    }

    visibleCurrentQuestions.forEach((question) => {
      const isRequired = question.is_required
        || (question.id === otherJobDependency?.detailId && otherJobSelected)
      if (isRequired && isEmpty(answers[question.id])) {
        errors[String(question.id)] = "Cette réponse est requise."
      }
    })

    currentPracticalTasks.forEach((task) => {
      const value = practicalTaskAnswers[task.id]
      if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 5)) {
        errors[task.id] = "La note doit être comprise entre 1 et 5."
      }
    })

    setFieldErrors((current) => ({ ...current, ...errors }))
    return Object.keys(errors).length === 0
  }

  const goForward = () => {
    setPageError("")
    // Temporary: allow interviewers to move between steps without completing fields.
    setFieldErrors({})
    setStep((current) => Math.min(current + 1, totalSteps - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const submitInterview = async () => {
    setPageError("")
    if (!validateCurrentStep()) return

    const candidate = {
      candidateNumber: candidateNumber.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phoneNumber1: phoneNumber1.trim(),
      phoneNumber2: phoneNumber2.trim(),
    }
    const clientSubmissionId = crypto.randomUUID()
    const submittedAnswers = { ...answers }
    if (otherJobDependency && !otherJobSelected) {
      delete submittedAnswers[otherJobDependency.detailId]
    }
    try {
      await archiveInterview({
        id: clientSubmissionId,
        candidate,
        answers: submittedAnswers,
        practicalTaskAnswers,
        generalInformationComment,
      })
    } catch {
      setPageError("Impossible d’enregistrer une copie locale durable. L’entrevue n’a pas été envoyée.")
      return
    }
    const saveForLater = async () => {
      await queueInterview({
        clientSubmissionId,
        candidate,
        answers: submittedAnswers,
        practicalTaskAnswers,
        generalInformationComment: generalInformationComment.trim(),
        createdAt: new Date().toISOString(),
        attempts: 0,
      })
      await clearInterviewDraft()
      await deleteNativeInterviewDraft()
      setPendingCount((current) => current + 1)
      setCompletionStatus("queued")
    }

    setSubmitting(true)
    try {
      if (!navigator.onLine) {
        await saveForLater()
        return
      }

      const result = await createInterview(
        candidate,
        submittedAnswers,
        practicalTaskAnswers,
        clientSubmissionId,
        generalInformationComment,
      )
      await updateNativePackageStatus(clientSubmissionId, "synced", {
        serverId: result.interview.id,
      })
      await clearInterviewDraft()
      await deleteNativeInterviewDraft()
      setCompletionStatus("saved")
    } catch (error) {
      if (error instanceof ApiError) {
        await updateNativePackageStatus(clientSubmissionId, "failed", { error: error.message })
        setFieldErrors((current) => ({ ...current, ...error.fieldErrors }))
        setPageError(error.message)
      } else {
        try {
          await saveForLater()
        } catch {
          setPageError("Impossible d'enregistrer l'entrevue hors ligne. Réessayez.")
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  const updateAnswer = (questionId: number, value: AnswerValue | undefined) => {
    setAnswers((current) => {
      const next = value === undefined
        ? { ...current }
        : { ...current, [questionId]: value }
      if (value === undefined) delete next[questionId]
      if (questionId === otherJobDependency?.triggerId && value !== true) {
        delete next[otherJobDependency.detailId]
      }
      return next
    })
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[String(questionId)]
      if (questionId === otherJobDependency?.triggerId && value !== true) {
        delete next[String(otherJobDependency.detailId)]
      }
      return next
    })
  }

  const updatePracticalTaskAnswer = (practicalTaskId: string, value: number) => {
    setPracticalTaskAnswers((current) => ({ ...current, [practicalTaskId]: value }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[practicalTaskId]
      return next
    })
  }

  const updateCandidateField = (
    field: string,
    value: string,
    setter: (value: string) => void,
  ) => {
    setter(value)
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  if (completionStatus !== null) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f6ef] px-5 py-12">
        <section className="w-full max-w-xl rounded-4xl border border-[#dce7d3] bg-white p-8 text-center shadow-[0_24px_70px_rgba(43,70,28,0.10)] sm:p-12">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-[#eaf4da] text-[#4f7818]">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#668f20]">
            {completionStatus === "saved" ? "Entrevue enregistrée" : "Entrevue sauvegardée hors ligne"}
          </p>
          <h1 className="text-3xl font-black tracking-[-0.03em] text-[#24351e]">
            {completionStatus === "saved" ? "Merci, c’est terminé." : "Le formulaire est en sécurité."}
          </h1>
          <p className="mx-auto mt-4 max-w-sm leading-7 text-[#687565]">
            {completionStatus === "saved" ? (
              <>Les réponses de <strong className="text-[#35482e]">{firstName} {lastName}</strong> ({candidateNumber}) ont bien été sauvegardées.</>
            ) : (
              <>Les réponses de <strong className="text-[#35482e]">{firstName} {lastName}</strong> seront envoyées automatiquement dès que la connexion reviendra.</>
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => {
                setAnswers({})
                setPracticalTaskAnswers({})
                setCandidateNumber("")
                setFirstName("")
                setLastName("")
                setPhoneNumber1("")
                setPhoneNumber2("")
                setStep(0)
                setFieldErrors({})
                setCompletionStatus(null)
              }}
              className="rounded-xl bg-[#4f7818] px-6 py-3 text-sm font-extrabold text-white transition hover:bg-[#416414]"
            >
              Nouvelle entrevue
            </button>
            <Link to="/" className="rounded-xl border border-[#d7e1d0] px-6 py-3 text-sm font-bold text-[#53634e] hover:bg-[#f7faf5]">
              Retour à l’accueil
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f6ef] text-[#24351e]">
   

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        {(!isOnline || usingCachedQuestions || pendingCount > 0) && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
            <p>
              {!isOnline || usingCachedQuestions
                ? "Mode hors ligne : le formulaire sera sauvegardé sur cet appareil."
                : `${pendingCount} entrevue${pendingCount > 1 ? "s" : ""} en attente de synchronisation.`}
            </p>
          </div>
        )}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between text-sm font-bold text-[#000000]">
            <span>Étape {step + 1} sur {totalSteps}</span>
           
          </div>
         
        </div>

        {loading ? (
          <div className="rounded-3xl border border-[#dfe8d8] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#dce7d3] border-t-[#5d861b]" />
            <p className="font-semibold text-[#687565]">Chargement du formulaire…</p>
          </div>
        ) : questions.length === 0 && practicalTasks.length === 0 ? (
          <div className="rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
            <h1 className="text-xl font-black text-[#24351e]">Le formulaire n’est pas disponible</h1>
            <p className="mt-3 text-sm leading-6 text-red-700">{pageError || "Aucune question active n'a été trouvée."}</p>
            <Link to="/" className="mt-6 inline-block rounded-xl bg-[#4f7818] px-5 py-3 text-sm font-bold text-white">Retour à l’accueil</Link>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (step === totalSteps - 1) void submitInterview()
              else goForward()
            }}
          >
            <section className="mb-7">
             
              <h1 className="text-3xl font-black tracking-[-0.035em] text-[#24351e] sm:text-4xl">
                {step === 0
                  ? "Informations du candidat"
                  : sectionLabels[currentSection?.code || ""]?.title || currentSection?.name}
              </h1>
         
            </section>

            {step === 0 ? (
              <section className="rounded-2xl border border-[#dfe8d8] bg-white p-6 shadow-[0_18px_50px_rgba(43,70,28,0.06)] sm:p-8">


                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <CandidateInput
                      id="candidate-number"
                      label="Numéro du candidat"
                      value={candidateNumber}
                      error={fieldErrors.candidate_number}
                      onChange={(value) => updateCandidateField("candidate_number", value, setCandidateNumber)}
                      required
                      autoComplete="off"
                      placeholder="Ex. 150"
                      maxLength={20}
                      autoFocus
                    />
                  </div>
                  <CandidateInput
                    id="candidate-first-name"
                    label="Prénom"
                    value={firstName}
                    error={fieldErrors.first_name}
                    onChange={(value) => updateCandidateField("first_name", value, setFirstName)}
                    required
                    autoComplete="given-name"
                    placeholder="Prénom du candidat"
                    maxLength={100}
                  />
                  <CandidateInput
                    id="candidate-last-name"
                    label="Nom de famille"
                    value={lastName}
                    error={fieldErrors.last_name}
                    onChange={(value) => updateCandidateField("last_name", value, setLastName)}
                    required
                    autoComplete="family-name"
                    placeholder="Nom du candidat"
                    maxLength={100}
                  />
                  <CandidateInput
                    id="candidate-phone-1"
                    label="Téléphone 1"
                    value={phoneNumber1}
                    error={fieldErrors.phone_number_1}
                    onChange={(value) => updateCandidateField("phone_number_1", value, setPhoneNumber1)}
                    required
                    type="tel"
                    autoComplete="tel"
                    placeholder="Ex. +502 5555 1234"
                    maxLength={30}
                  />
                  <CandidateInput
                    id="candidate-phone-2"
                    label="Téléphone 2 (facultatif)"
                    value={phoneNumber2}
                    error={fieldErrors.phone_number_2}
                    onChange={(value) => updateCandidateField("phone_number_2", value, setPhoneNumber2)}
                    type="tel"
                    autoComplete="tel"
                    placeholder="Deuxième numéro"
                    maxLength={30}
                  />
                </div>
              </section>
            ) : (
              <div className="space-y-2">
                {currentFields.map((item) => item.kind === "question" ? (
                  <QuestionField
                    key={`question-${item.field.id}`}
                    question={item.field}
                    value={answers[item.field.id]}
                    error={fieldErrors[String(item.field.id)]}
                    required={item.field.is_required || (
                      item.field.id === otherJobDependency?.detailId && otherJobSelected
                    )}
                    onChange={(value) => updateAnswer(item.field.id, value)}
                  />
                ) : (
                  <PracticalTaskField
                    key={`practical-task-${item.field.id}`}
                    task={item.field}
                    value={practicalTaskAnswers[item.field.id]}
                    error={fieldErrors[item.field.id]}
                    onChange={(value) => updatePracticalTaskAnswer(item.field.id, value)}
                  />
                ))}
                {currentSection?.code === "general_information" && (
                  <div className="rounded-2xl border border-[#dfe8d8] bg-white p-5 transition-colors focus-within:border-[#668f20] sm:p-6">
                    <label
                      htmlFor="general-information-comment"
                      className="mb-4 block text-base font-semibold leading-6 text-[#24351e]"
                    >
                      Commentaires
                    </label>
                    <textarea
                      id="general-information-comment"
                      rows={4}
                      maxLength={5000}
                      value={generalInformationComment}
                      onChange={(event) => setGeneralInformationComment(event.target.value)}
                      placeholder="Indiquez toute autre information familiale pertinente ici"
                      className="w-full resize-y rounded-xl border border-[#d9e3d2] bg-[#fbfcfa] px-4 py-3 text-base leading-6 text-[#24351e] outline-none transition placeholder:text-[#99a295] focus:border-[#668f20] focus:ring-4 focus:ring-[#668f20]/10"
                    />
                  </div>
                )}
              </div>
            )}

            {pageError && (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800" role="alert">{pageError}</div>
            )}

            <div className="mt-8 flex items-center justify-between gap-4 border-t border-[#dfe7d9] pt-6">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setStep((current) => Math.max(0, current - 1))
                    setPageError("")
                    window.scrollTo({ top: 0, behavior: "smooth" })
                  }}
                  className="rounded-xl px-4 py-3 text-sm font-extrabold text-[#687565] transition hover:bg-white hover:text-[#35482e]"
                >
                  ← Précédent
                </button>
              ) : <span />}
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-w-36 items-center cursor-pointer justify-center gap-2 rounded-xl bg-[#4f7818] px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(79,120,24,0.20)] transition hover:bg-[#416414] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Enregistrement…" : step === totalSteps - 1 ? "Terminer l’entrevue" : "Continuer →"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
