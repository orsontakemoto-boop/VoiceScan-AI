import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `
Você é um especialista em fonoaudiologia, engenharia de áudio e análise espectral. 
Sua tarefa é analisar o arquivo de áudio fornecido contendo fala humana e, se disponível, a imagem do seu espectrograma.
Forneça uma análise concisa, estruturada e profissional cobrindo os seguintes pontos:

1.  **Características Vocais**: Descreva o timbre (ex: rouco, aveludado, estridente, anasalado, soproso).
2.  **Tonalidade e Pitch**: Classifique a voz (Grave, Médio, Agudo) e estime a estabilidade.
3.  **Dinâmica e Intensidade**: A voz varia bem o volume ou é monótona?
4.  **Emoção/Intenção**: Qual a emoção transmitida (calma, ansiosa, autoritária, hesitante)?
5.  **Análise do Espectrograma**: Analise visualmente o espectrograma.
    - **Harmônicos**: Linhas horizontais nítidas e paralelas indicam boa periodicidade e voz limpa?
    - **Ruído**: Presença de "borrões" ou estática entre os harmônicos (indício de soprosidade ou ruído de fundo)?
    - **Estabilidade**: As linhas são contínuas ou quebradas/trêmulas (jitter/shimmer)?
    - **Formantes**: Há regiões de energia concentrada bem definidas?
6.  **Recomendação Rápida**: Uma dica breve para melhoria da comunicação ou saúde vocal.

Formate a resposta usando Markdown. Use emojis para ilustrar os pontos principais. Seja técnico mas acessível.
`;

export const analyzeAudioWithGemini = async (audioBlob: Blob, spectrogramBase64?: string): Promise<string> => {
  try {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found");

    const ai = new GoogleGenAI({ apiKey });
    
    // Convert Blob to Base64
    const base64Audio = await blobToBase64(audioBlob);

    const parts: any[] = [
      {
        inlineData: {
          mimeType: audioBlob.type,
          data: base64Audio
        }
      }
    ];

    let promptText = "Analise este áudio focando nas características da voz.";

    if (spectrogramBase64) {
      // Clean base64 string if it contains the header
      const base64Image = spectrogramBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
      
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Image
        }
      });
      promptText = "Analise o áudio e a imagem do espectrograma anexada. Correlacione o que você ouve com os padrões visuais no espectrograma (ex: harmônicos, ruído).";
    }

    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: parts
      },
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.4, // Lower temperature for more analytical results
      }
    });

    return response.text || "Não foi possível gerar uma análise.";

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "Erro ao conectar com a IA. Verifique sua chave de API ou tente novamente.";
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};