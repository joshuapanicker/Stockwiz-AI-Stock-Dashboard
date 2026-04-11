import { useTypewriter } from "../hooks/useTypewriter";

interface Props {
  content: string;
  isStreaming: boolean;
}

export default function TypewriterMessage({ content, isStreaming }: Props) {
  const { displayed, done } = useTypewriter(content);
  const showCursor = isStreaming || !done;

  const lines = displayed
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .split("\n")
    .filter(Boolean);

  if (lines.length === 0) {
    return showCursor
      ? <span className="inline-block w-[2px] h-[1em] bg-current align-middle animate-pulse opacity-70" />
      : null;
  }

  return (
    <>
      {lines.map((line, i) => (
        <p key={i} className={line.startsWith("-") || line.match(/^\d+\./) ? "pl-2 mt-1" : "mt-1 first:mt-0"}>
          {line}
          {i === lines.length - 1 && showCursor && (
            <span className="inline-block w-[2px] h-[1em] bg-current ml-[1px] align-middle animate-pulse opacity-70" />
          )}
        </p>
      ))}
    </>
  );
}
