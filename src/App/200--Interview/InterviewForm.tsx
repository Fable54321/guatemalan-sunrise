import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ApiError,
  createInterview,
  getInterviewQuestions,
  type AnswerValue,
  type InterviewQuestion,
} from "../../api/candidateInterviews"

const sectionOrder = [
  "group_meeting",
  "general_information",
  "presentation",
  "practical_exercises",
  "motivation",
  "final_comments",
]

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
  onChange,
}: {
  question: InterviewQuestion
  value?: AnswerValue
  error?: string
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
        {question.is_required && (
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
          rows={question.section === "final_comments" ? 6 : 3}
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

export default function InterviewForm() {
  const [questions, setQuestions] = useState<InterviewQuestion[]>([])
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({})
  const [candidateNumber, setCandidateNumber] = useState("")
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [pageError, setPageError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [completedInterviewId, setCompletedInterviewId] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    getInterviewQuestions(controller.signal)
      .then(({ questions: loadedQuestions }) => {
        if (!active) return
        setQuestions(loadedQuestions)
        setPageError("")
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return
        setPageError(
          error instanceof ApiError && error.status === 401
            ? "Votre session a expiré. Veuillez vous reconnecter au portail."
            : error instanceof Error
              ? error.message
              : "Impossible de charger le formulaire.",
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  const sections = useMemo(() => {
    const availableSections = new Set(questions.map((question) => question.section))
    const orderedSections = sectionOrder.filter((section) => availableSections.has(section))
    const extraSections = [...availableSections].filter((section) => !sectionOrder.includes(section))
    return [...orderedSections, ...extraSections]
  }, [questions])

  const currentSection = step > 0 ? sections[step - 1] : null
  const currentQuestions = currentSection
    ? questions.filter((question) => question.section === currentSection)
    : []
  const totalSteps = sections.length + 1
 

  const validateCurrentStep = () => {
    const errors: Record<string, string> = {}

    if (step === 0 && !candidateNumber.trim()) {
      errors.candidate_number = "Entrez le numéro du candidat."
    }

    currentQuestions.forEach((question) => {
      if (question.is_required && isEmpty(answers[question.id])) {
        errors[String(question.id)] = "Cette réponse est requise."
      }
    })

    setFieldErrors((current) => ({ ...current, ...errors }))
    return Object.keys(errors).length === 0
  }

  const goForward = () => {
    setPageError("")
    if (!validateCurrentStep()) return
    setStep((current) => Math.min(current + 1, totalSteps - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const submitInterview = async () => {
    setPageError("")
    if (!validateCurrentStep()) return

    setSubmitting(true)
    try {
      const result = await createInterview(candidateNumber.trim(), answers)
      setCompletedInterviewId(result.interview.id)
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors((current) => ({ ...current, ...error.fieldErrors }))
        setPageError(error.message)
      } else {
        setPageError("Impossible d'enregistrer l'entrevue. Réessayez.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const updateAnswer = (questionId: number, value: AnswerValue | undefined) => {
    setAnswers((current) => {
      if (value !== undefined) return { ...current, [questionId]: value }

      const next = { ...current }
      delete next[questionId]
      return next
    })
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[String(questionId)]
      return next
    })
  }

  if (completedInterviewId !== null) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f3f6ef] px-5 py-12">
        <section className="w-full max-w-xl rounded-4xl border border-[#dce7d3] bg-white p-8 text-center shadow-[0_24px_70px_rgba(43,70,28,0.10)] sm:p-12">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-[#eaf4da] text-[#4f7818]">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#668f20]">Entrevue enregistrée</p>
          <h1 className="text-3xl font-black tracking-[-0.03em] text-[#24351e]">Merci, c’est terminé.</h1>
          <p className="mx-auto mt-4 max-w-sm leading-7 text-[#687565]">
            Les réponses du candidat <strong className="text-[#35482e]">{candidateNumber}</strong> ont bien été sauvegardées.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => {
                setAnswers({})
                setCandidateNumber("")
                setStep(0)
                setFieldErrors({})
                setCompletedInterviewId(null)
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
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between text-xs font-bold text-[#687565]">
            <span>Étape {step + 1} sur {totalSteps}</span>
           
          </div>
         
        </div>

        {loading ? (
          <div className="rounded-3xl border border-[#dfe8d8] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-[#dce7d3] border-t-[#5d861b]" />
            <p className="font-semibold text-[#687565]">Chargement du formulaire…</p>
          </div>
        ) : questions.length === 0 ? (
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
                {step === 0 ? "Identifier le candidat" : sectionLabels[currentSection || ""]?.title || currentSection}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#687565] sm:text-base">
                {step === 0
                  ? "Commencez par inscrire le numéro attribué au candidat. Vous pourrez ensuite compléter l’entrevue section par section."
                  : "Répondez selon vos observations. Les champs marqués d’un astérisque sont obligatoires."}
              </p>
            </section>

            {step === 0 ? (
              <section className={`rounded-2xl border bg-white p-6 shadow-[0_18px_50px_rgba(43,70,28,0.06)] sm:p-8 ${fieldErrors.candidate_number ? "border-red-300" : "border-[#dfe8d8]"}`}>
                <label htmlFor="candidate-number" className="mb-2 block text-sm font-extrabold text-[#35482e]">
                  Numéro du candidat <span className="text-[#d95726]">*</span>
                </label>
                <p className="mb-4 text-sm text-[#758271]">Utilisez le numéro qui apparaît sur la fiche ou la photo du candidat.</p>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[#7a8c72]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 4h10M7 20h10M10 2 8 22M16 2l-2 20M4 9h16M3 15h16" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    id="candidate-number"
                    autoFocus
                    autoComplete="off"
                    maxLength={100}
                    value={candidateNumber}
                    onChange={(event) => {
                      setCandidateNumber(event.target.value)
                      setFieldErrors((current) => {
                        const next = { ...current }
                        delete next.candidate_number
                        return next
                      })
                    }}
                    placeholder="Ex. GT-024"
                    className="w-full rounded-xl border border-[#d9e3d2] bg-[#fbfcfa] py-4 pl-12 pr-4 text-lg font-bold tracking-wide text-[#24351e] uppercase outline-none transition placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-[#a3aca0] focus:border-[#668f20] focus:ring-4 focus:ring-[#668f20]/10"
                  />
                </div>
                {fieldErrors.candidate_number && <p className="mt-3 text-sm font-semibold text-red-700">{fieldErrors.candidate_number}</p>}
              </section>
            ) : (
              <div className="space-y-2">
                {currentQuestions.map((question) => (
                  <QuestionField
                    key={question.id}
                    question={question}
                    value={answers[question.id]}
                    error={fieldErrors[String(question.id)]}
                    onChange={(value) => updateAnswer(question.id, value)}
                  />
                ))}
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
