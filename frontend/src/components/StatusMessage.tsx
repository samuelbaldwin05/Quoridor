interface StatusMessageProps {
  message: { text: string; kind: 'info' | 'success' | 'error' } | null;
}

export function StatusMessage({ message }: StatusMessageProps) {
  if (!message) return <div className="message-display" />;

  return (
    <div className={`message-display message-${message.kind}`} id="message">
      {message.text}
    </div>
  );
}
