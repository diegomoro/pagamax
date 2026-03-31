export interface RecommendationCliArgs {
  qrPayload: string;
  amountArg: string;
  methodsPath: string;
  today?: string;
  topArg?: string;
  asJson: boolean;
}

function getNamedArg(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1]! : undefined;
}

export function parseRecommendationCliArgs(args: string[]): RecommendationCliArgs | null {
  const positional = args.filter(arg => !arg.startsWith('--'));

  const qrPayload = getNamedArg(args, '--qr') ?? positional[0];
  const amountArg = getNamedArg(args, '--amount') ?? positional[1];
  const methodsPath = getNamedArg(args, '--methods') ?? positional[2];
  const today = getNamedArg(args, '--today');
  const topArg = getNamedArg(args, '--top');

  if (!qrPayload || !amountArg || !methodsPath) {
    return null;
  }

  return {
    qrPayload,
    amountArg,
    methodsPath,
    today,
    topArg,
    asJson: args.includes('--json'),
  };
}
