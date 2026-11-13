// Capture guidance only. Narrative and live speech availability have separate gates.
export const captureLocales = {
  "en-IN": {
    lang: "en",
    hint: "Type or record invented customer details. Correct every detail before review.",
    review: "Check the customer ID, credit or repayment, and exact amount. Confirm only after reviewing.",
    example: "Ramesh took 500 rupees credit",
  },
  "hi-IN": {
    lang: "hi",
    hint: "काल्पनिक ग्राहक की बात लिखें या रिकॉर्ड करें। समीक्षा से पहले हर जानकारी सुधारें।",
    review: "ग्राहक की आईडी, उधार या वापसी और सही रकम जाँचें। समीक्षा के बाद ही पुष्टि करें।",
    example: "रमेश को 500 रुपये उधार दिए",
  },
  "te-IN": {
    lang: "te",
    hint: "కల్పిత కస్టమర్ వివరాలను టైప్ చేయండి లేదా రికార్డ్ చేయండి. సమీక్షకు ముందు వివరాలను సరిచూడండి.",
    review: "కస్టమర్ ఐడీ, బాకీ లేదా తిరిగి చెల్లింపు, ఖచ్చితమైన మొత్తాన్ని తనిఖీ చేసి నిర్ధారించండి.",
    example: "రమేష్ 500 రూపాయలు బాకీ తీసుకున్నాడు",
  },
} as const;

export function captureLocale(language: string) {
  return captureLocales[language as keyof typeof captureLocales] || captureLocales["en-IN"];
}
