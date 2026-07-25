import type { Cue } from './contracts';

const TTML_NAMESPACE = 'http://www.w3.org/ns/ttml';
const TTML_PARAMETER_NAMESPACE = 'http://www.w3.org/ns/ttml#parameter';
const TTML_STYLING_NAMESPACE = 'http://www.w3.org/ns/ttml#styling';
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

interface XmlNodeList {
  readonly length: number;
  item(index: number): XmlNode | null;
}

interface XmlNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly localName: string | null;
  readonly namespaceURI: string | null;
  readonly nodeValue: string | null;
  readonly childNodes: XmlNodeList;
}

interface XmlElement extends XmlNode {
  getAttribute(name: string): string;
  getAttributeNS(namespace: string, localName: string): string;
}

interface XmlDocument {
  readonly documentElement: XmlElement | null;
  getElementsByTagName(name: string): XmlNodeList;
  getElementsByTagNameNS(namespace: string, localName: string): XmlNodeList;
}

export interface TtmlParserOptions {
  readonly language: string;
  readonly acceptedSourceLanguages?: readonly string[];
  readonly allowMissingSourceLanguage?: boolean;
  readonly allowUnderspecifiedSourceLanguage?: boolean;
  readonly parser?: {
    parseFromString(source: string, mimeType: 'application/xml'): unknown;
  };
}

export function parseTtml(
  raw: string,
  options: TtmlParserOptions,
): Cue[] {
  if (!hasXmlMagic(raw) || options.language.length === 0) return [];

  const parser = options.parser ?? new DOMParser();
  let document: XmlDocument;
  try {
    document = parser.parseFromString(
      raw,
      'application/xml',
    ) as XmlDocument;
  } catch {
    return [];
  }

  const root = document.documentElement;
  if (
    root === null ||
    localName(root) !== 'tt' ||
    root.namespaceURI !== TTML_NAMESPACE ||
    document.getElementsByTagName('parsererror').length > 0
  ) {
    return [];
  }

  if (options.acceptedSourceLanguages !== undefined) {
    const sourceLanguage = rootLanguage(root);
    if (
      (sourceLanguage === '' && options.allowMissingSourceLanguage !== true) ||
      (sourceLanguage !== '' &&
        !sourceLanguageAccepted(
          sourceLanguage,
          options.acceptedSourceLanguages,
          options.allowUnderspecifiedSourceLanguage === true,
        ))
    ) {
      return [];
    }
  }

  const topRegions = collectTopRegions(document);
  const tickRate = readTickRate(root);
  const cues: Cue[] = [];
  const paragraphs = document.getElementsByTagNameNS(TTML_NAMESPACE, 'p');

  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = asElement(paragraphs.item(index));
    if (paragraph === null) continue;

    const start = parseTime(paragraph.getAttribute('begin'), tickRate);
    const end = parseTime(paragraph.getAttribute('end'), tickRate);
    const text = extractText(paragraph);
    if (start === undefined || end === undefined || end <= start || text === '') {
      continue;
    }

    const cue: Cue = { start, end, text, language: options.language };
    const region = paragraph.getAttribute('region');
    cues.push(topRegions.has(region) ? { ...cue, position: 'top' } : cue);
  }

  return cues;
}

function sourceLanguageAccepted(
  sourceLanguage: string,
  acceptedLanguages: readonly string[],
  allowUnderspecified: boolean,
): boolean {
  const normalizedSource = sourceLanguage.toLowerCase();
  return acceptedLanguages.some((language) => {
    const normalizedAccepted = language.toLowerCase();
    return (
      normalizedAccepted === normalizedSource ||
      (allowUnderspecified &&
        normalizedAccepted.startsWith(`${normalizedSource}-`))
    );
  });
}

function readTickRate(root: XmlElement): number | undefined {
  const raw =
    root.getAttributeNS(TTML_PARAMETER_NAMESPACE, 'tickRate') ||
    root.getAttribute('ttp:tickRate');
  if (raw === '') return undefined;

  const tickRate = Number(raw);
  return Number.isFinite(tickRate) && tickRate > 0 ? tickRate : undefined;
}

function parseTime(value: string, tickRate: number | undefined): number | undefined {
  const clockTime = parseClockTime(value);
  if (clockTime !== undefined) return clockTime;

  const ticks = value.match(/^(\d+(?:\.\d+)?)t$/)?.[1];
  if (ticks === undefined || tickRate === undefined) return undefined;
  const tickValue = Number(ticks);
  return Number.isFinite(tickValue) ? (tickValue * 1_000) / tickRate : undefined;
}

function hasXmlMagic(raw: string): boolean {
  const start = raw.replace(/^\uFEFF/, '').trimStart();
  return start.startsWith('<?xml') || start.startsWith('<tt');
}

function collectTopRegions(document: XmlDocument): ReadonlySet<string> {
  const result = new Set<string>();
  const regions = document.getElementsByTagNameNS(TTML_NAMESPACE, 'region');

  for (let index = 0; index < regions.length; index += 1) {
    const region = asElement(regions.item(index));
    if (region === null) continue;

    const id =
      region.getAttributeNS(XML_NAMESPACE, 'id') ||
      region.getAttribute('xml:id');
    const origin =
      region.getAttributeNS(TTML_STYLING_NAMESPACE, 'origin') ||
      region.getAttribute('tts:origin');
    const verticalPercent = origin.match(
      /^\s*-?(?:\d+(?:\.\d+)?|\.\d+)%\s+(-?(?:\d+(?:\.\d+)?|\.\d+))%\s*$/,
    )?.[1];

    if (
      id !== '' &&
      verticalPercent !== undefined &&
      Number(verticalPercent) < 50
    ) {
      result.add(id);
    }
  }

  return result;
}

function parseClockTime(value: string): number | undefined {
  const match = value.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (match === null) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes >= 60 || seconds >= 60) return undefined;

  const fraction = (match[4] ?? '').padEnd(3, '0').slice(0, 3);
  return ((hours * 60 + minutes) * 60 + seconds) * 1_000 + Number(fraction);
}

function extractText(paragraph: XmlElement): string {
  const parts: string[] = [];
  appendText(paragraph, parts);
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/[\s\u00a0]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function appendText(node: XmlNode, parts: string[]): void {
  if (node.nodeType === 3) {
    parts.push(node.nodeValue ?? '');
    return;
  }
  if (node.nodeType === 1 && localName(node) === 'br') {
    parts.push('\n');
    return;
  }

  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index);
    if (child !== null) appendText(child, parts);
  }
}

function asElement(node: XmlNode | null): XmlElement | null {
  return node?.nodeType === 1 ? (node as XmlElement) : null;
}

function localName(node: XmlNode): string {
  return node.localName ?? node.nodeName.split(':').at(-1) ?? node.nodeName;
}

function rootLanguage(root: XmlElement): string {
  return (
    root.getAttributeNS(XML_NAMESPACE, 'lang') ||
    root.getAttribute('xml:lang') ||
    ''
  );
}
