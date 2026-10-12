import { type ReactNode, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowUp, RotateCcw, Sparkles, Square } from 'lucide-react';
import { getSendChatMessageUrl, type ChatInput, type ChatMessage } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
  }, [draft]);

  async function streamReply(history: ChatMessage[]) {
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setError('');
    const assistantIndex = history.length;
    setMessages([...history, { role: 'assistant', content: '' }]);
    try {
      const payload: ChatInput = { messages: history.slice(-30) };
      const response = await fetch(getSendChatMessageUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = `The request could not be completed (${response.status}).`;
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // Keep the readable fallback when the server did not return JSON.
        }
        throw new Error(message);
      }
      if (!response.body) throw new Error('This browser could not open the reply stream. Please try again.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let complete = false;
      let answer = '';
      const consumeFrame = (frame: string) => {
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) return;
        const event = JSON.parse(data) as { content?: string; done?: boolean; error?: string };
        if (event.content) {
          answer += event.content;
          setMessages((current) => current.map((item, index) => (
            index === assistantIndex ? { ...item, content: answer } : item
          )));
        }
        if (event.error) throw new Error(event.error);
        if (event.done) complete = true;
      };

      while (!complete) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const frames = pending.split(/\r?\n\r?\n/);
        pending = frames.pop() ?? '';
        for (const frame of frames) {
          consumeFrame(frame);
          if (complete) break;
        }
      }
      pending += decoder.decode();
      if (pending.trim()) consumeFrame(pending);
      if (!complete && !controller.signal.aborted) {
        throw new Error('The reply ended before it was complete. You can try again.');
      }
    } catch (caught) {
      if (caught instanceof Error && caught.name !== 'AbortError') {
        setError(caught.message || 'Something went wrong. Please try again.');
        setMessages((current) => current.filter((item, index) => (
          index !== assistantIndex || item.content.length > 0
        )));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreaming(false);
      }
    }
  }

  function submitMessage(value = draft) {
    const content = value.trim();
    if (!content || streaming) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content }];
    setDraft('');
    setError('');
    void streamReply(history);
  }

  function startOver() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setDraft('');
    setError('');
    setStreaming(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function retryLast() {
    const history = messages.at(-1)?.role === 'assistant' ? messages.slice(0, -1) : messages;
    if (history.at(-1)?.role === 'user') void streamReply(history);
  }

  const hasConversation = messages.length > 0;

  return (
    <main className="grain relative flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="relative z-10 flex h-[76px] shrink-0 items-center justify-between border-b border-border/70 px-5 sm:px-9">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-[13px] bg-primary text-primary-foreground shadow-sm">
            <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold tracking-[-0.035em]">little answer</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">a simple AI chat</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-[#6c9e81]" />
            Ready when you are
          </div>
          {hasConversation && (
            <button
              type="button"
              onClick={startOver}
              data-testid="button-start-over"
              className="group inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 text-xs font-medium text-foreground/80 transition hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw size={14} className="transition-transform group-hover:-rotate-45" />
              <span className="hidden sm:inline">Start over</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </header>

      <section className="relative z-10 flex min-h-0 flex-1 flex-col">
        {!hasConversation ? (
          <div className="mx-auto flex w-full max-w-[800px] flex-1 flex-col justify-center px-5 pb-10 pt-14 sm:px-8">
            <div className="mb-8 flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[.18em] text-primary">
              <span className="h-px w-7 bg-accent" />
              No setup. Just ask.
            </div>
            <h1 className="max-w-[720px] font-serif text-[clamp(3.6rem,9vw,7rem)] leading-[.93] tracking-[-.065em] text-foreground">
              Good questions
              <br />
              <span className="text-primary">start somewhere.</span>
            </h1>
            <p className="mt-7 max-w-[465px] text-[15px] leading-7 text-muted-foreground sm:text-base">
              A little help for the things you’re curious about, figuring out, or just wondering.
            </p>

            <div className="mt-11 grid max-w-[660px] grid-cols-1 gap-2.5 sm:grid-cols-3">
              {[
                { label: 'Explain something', prompt: 'Can you explain compound interest in simple terms?' },
                { label: 'Plan a meal', prompt: 'Help me plan a simple dinner with chickpeas and spinach.' },
                { label: 'Find a fresh idea', prompt: 'What is a small, fun thing I can do this weekend?' },
              ].map((idea, index) => (
                <button
                  key={idea.label}
                  type="button"
                  onClick={() => submitMessage(idea.prompt)}
                  data-testid={`button-suggestion-${index}`}
                  className="group flex min-h-[74px] items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/55 px-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-[0_8px_24px_-18px_hsl(var(--primary)/.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>
                    <span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-muted-foreground">Try this</span>
                    <span className="mt-1 block text-[13px] font-medium tracking-[-.01em]">{idea.label}</span>
                  </span>
                  <ArrowUp size={15} className="rotate-45 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-4 sm:px-8">
            <div
              className="flex-1 overflow-y-auto pb-8 pt-10"
              aria-live="polite"
              aria-relevant="additions text"
              data-testid="conversation-messages"
            >
              <div className="space-y-9">
                {messages.map((message, index) => (
                  <article
                    key={`${index}-${message.role}`}
                    className={`message-enter ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}
                    data-testid={`message-${message.role}-${index}`}
                  >
                    {message.role === 'user' ? (
                      <div className="max-w-[88%] rounded-[22px] rounded-br-[7px] bg-primary px-5 py-3.5 text-[14px] leading-6 text-primary-foreground shadow-[0_6px_18px_-14px_hsl(var(--primary)/.65)] sm:max-w-[78%] sm:px-6">
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      </div>
                    ) : (
                      <div className="w-full max-w-[700px]">
                        <div className="mb-3 flex items-center gap-2.5">
                          <span className="grid size-7 place-items-center rounded-[10px] bg-accent/15 text-accent">
                            <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-muted-foreground">A little answer</span>
                        </div>
                        {message.content ? (
                          <p className="whitespace-pre-wrap break-words pl-0.5 text-[15px] leading-[1.85] text-foreground/90 sm:text-[16px]">{message.content}</p>
                        ) : streaming ? (
                          <div className="flex h-8 items-center gap-1.5 pl-1" role="status" aria-label="Writing a reply">
                            <span className="dot-pulse size-1.5 rounded-full bg-primary" />
                            <span className="dot-pulse size-1.5 rounded-full bg-primary" />
                            <span className="dot-pulse size-1.5 rounded-full bg-primary" />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </article>
                ))}
                {error && (
                  <div className="message-enter rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3.5 text-sm text-foreground" role="alert" data-testid="status-chat-error">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{error}</span>
                      {messages.some((message) => message.role === 'user') && (
                        <button type="button" onClick={retryLast} data-testid="button-retry" className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                          Try again
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 mx-auto w-full max-w-[820px] shrink-0 px-4 pb-[max(22px,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pb-7">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (streaming) {
                abortRef.current?.abort();
                setStreaming(false);
                abortRef.current = null;
              } else {
                submitMessage();
              }
            }}
            className="group rounded-[24px] border border-border bg-card px-4 pb-3 pt-3 shadow-[0_14px_45px_-32px_hsl(var(--foreground)/.42)] transition focus-within:border-primary/40 focus-within:shadow-[0_15px_48px_-30px_hsl(var(--primary)/.35)] sm:px-5"
          >
            <label htmlFor="chat-input" className="sr-only">Ask a question</label>
            <textarea
              ref={textareaRef}
              id="chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!streaming) submitMessage();
                }
              }}
              placeholder="Ask anything…"
              rows={1}
              maxLength={6000}
              disabled={streaming}
              data-testid="input-chat"
              className="block max-h-[180px] min-h-[48px] w-full resize-none bg-transparent py-3 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/75 disabled:opacity-65"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted-foreground/80">
                <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
                <span className="sm:hidden">A fresh conversation, every time</span>
              </span>
              <button
                type="submit"
                disabled={!streaming && !draft.trim()}
                aria-label={streaming ? 'Stop response' : 'Send message'}
                data-testid="button-send"
                className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground transition duration-200 hover:-translate-y-0.5 hover:bg-primary/90 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                {streaming ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} strokeWidth={2.3} />}
              </button>
            </div>
          </form>
          <p className="mt-3 text-center text-[10px] tracking-[.02em] text-muted-foreground/80">
            Clear, useful answers — without the ceremony.
          </p>
        </div>
      </section>
      <span className="sr-only" role="status" data-testid="status-streaming">{streaming ? 'Assistant is responding' : ''}</span>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
