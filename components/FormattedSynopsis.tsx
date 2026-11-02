import { Fragment } from 'react';

// Render only supported text markers. Raw HTML remains escaped by React.
export default function FormattedSynopsis({ text }: { text: string }) {
  return <div className="space-y-3 break-words">{text.split('\n').map((line, index) => {
    const heading = line.startsWith('## ');
    const content = (heading ? line.slice(3) : line).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part.startsWith('*') && part.endsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : <Fragment key={i}>{part}</Fragment>);
    return heading ? <h3 key={index} className="text-xl font-bold">{content}</h3> : <p key={index} className="min-h-3 whitespace-pre-wrap">{content}</p>;
  })}</div>;
}
