// A small Markdown subset. React escapes all text; raw HTML is never executed.
export default function PolicyDocumentBody({ content }: { content: string }) {
  return <div className="space-y-5 break-words text-sm leading-7 text-white/80 [overflow-wrap:anywhere]">
    {content.trim().split(/\n\s*\n/).map((block, index) => {
      if (/^#{1,3} /.test(block)) return <h2 key={index} className="mt-8 rounded-2xl border-l-2 border-[#ff9bca]/60 bg-gradient-to-r from-[#ff9bca]/10 to-transparent px-5 py-4 text-xl font-bold leading-7 text-[#ffd1e7]">{block.replace(/^#{1,3} /, '')}</h2>;
      if (block.startsWith('> ')) return <blockquote key={index} className="border-l-2 border-amber-300/50 pl-4 text-amber-100">{block.replace(/^> /gm, '')}</blockquote>;
      if (block.split('\n').every((line) => line.startsWith('- '))) return <ul key={index} className="list-disc space-y-2 pl-5">{block.split('\n').map((line, item) => <li key={item}>{line.slice(2)}</li>)}</ul>;
      return <p key={index} className="whitespace-pre-line">{block}</p>;
    })}
  </div>;
}
