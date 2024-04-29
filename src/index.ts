import grammar from "../syntaxes/shell-session.tmLanguage.json" assert { type: "json" };
import type { LanguageRegistration } from "shiki";

export default grammar as unknown as LanguageRegistration;
