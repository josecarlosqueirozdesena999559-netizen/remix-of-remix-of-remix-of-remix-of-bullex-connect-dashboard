const WHATSAPP_NUMBER = "558189984096";

export function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${WHATSAPP_NUMBER}`}
      target="_blank"
      rel="noreferrer"
      aria-label={`Falar pelo WhatsApp no numero ${WHATSAPP_NUMBER}`}
      className="fixed bottom-4 right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition hover:scale-105 hover:bg-[#20bd5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
    >
      <WhatsAppLogo />
    </a>
  );
}

function WhatsAppLogo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="h-8 w-8 fill-current">
      <path d="M16.04 3.2A12.78 12.78 0 0 0 5.16 22.68L3.2 28.8l6.3-1.86A12.8 12.8 0 1 0 16.04 3.2Zm0 2.18a10.62 10.62 0 1 1-5.42 19.76l-.38-.23-3.74 1.1 1.14-3.64-.25-.4A10.6 10.6 0 0 1 16.04 5.38Zm-5.1 4.42c-.25 0-.65.1-.99.47-.34.37-1.3 1.27-1.3 3.1s1.34 3.6 1.52 3.85c.19.25 2.63 4.02 6.38 5.64.89.38 1.59.61 2.13.78.9.28 1.71.24 2.35.15.72-.11 2.2-.9 2.51-1.77.31-.87.31-1.61.22-1.77-.09-.15-.34-.25-.71-.43-.37-.19-2.2-1.09-2.54-1.21-.34-.13-.59-.19-.84.18-.25.38-.96 1.21-1.18 1.46-.22.25-.43.28-.81.09-.37-.18-1.58-.58-3.01-1.86a11.3 11.3 0 0 1-2.08-2.59c-.22-.37-.02-.57.16-.75.17-.17.37-.44.56-.65.19-.22.25-.38.37-.62.13-.25.06-.47-.03-.65-.09-.19-.84-2.02-1.15-2.76-.3-.73-.61-.63-.84-.64h-.71Z" />
    </svg>
  );
}
