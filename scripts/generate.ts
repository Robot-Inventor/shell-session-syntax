import Parser from "rss-parser";
import fs from "fs";
import path from "path";
import tar from "tar";

const TEMPORARY_DIRECTORY = "temp";
const OUTPUT_DIRECTORY = "syntaxes";

const SHELL_GRAMMAR_REPOSITORY_URL = "https://github.com/jeff-hykin/better-shell-syntax/";
const SHELL_GRAMMAR_RAW_URL = "https://raw.githubusercontent.com/jeff-hykin/better-shell-syntax/";
const LINGUIST_REPOSITORY_URL = "https://github.com/github-linguist/linguist/";

const fetchJSON = async (url: string) => {
    const response = await fetch(url);
    return response.json();
};

const fetchBinary = async (url: string) => {
    const response = await fetch(url);
    return response.arrayBuffer();
};

const fetchShellGrammar = async () => {
    console.log("Fetching shell grammar...");

    const commits_feed_URL = new URL("commits.atom", SHELL_GRAMMAR_REPOSITORY_URL).href;

    const parser = new Parser({
        customFields: {
            item: ["id"]
        }
    });
    const feed = await parser.parseURL(commits_feed_URL);
    const latestCommit = feed.items[0].id.match(/Commit\/([a-f0-9]+)/)[1];

    const grammarURL = new URL(`${latestCommit}/autogenerated/shell.tmLanguage.json`, SHELL_GRAMMAR_RAW_URL).href;
    const grammar = await fetchJSON(grammarURL);

    return {
        grammar,
        version: latestCommit
    };
};

const fetchShellSessionGrammar = async () => {
    console.log("Fetching shell-session grammar...");

    const releases_feed_URL = new URL("releases.atom", LINGUIST_REPOSITORY_URL).href;

    const parser = new Parser();
    const feed = await parser.parseURL(releases_feed_URL);
    const latestVersion = feed.items[0].title;

    const grammarURL = new URL(`releases/download/${latestVersion}/linguist-grammars.tar.gz`, LINGUIST_REPOSITORY_URL)
        .href;
    const grammar = await fetchBinary(grammarURL);
    if (!fs.existsSync(TEMPORARY_DIRECTORY)) {
        fs.mkdirSync(TEMPORARY_DIRECTORY);
    }
    const grammarPath = path.join(TEMPORARY_DIRECTORY, "linguist-grammars.tar.gz");
    fs.writeFileSync(grammarPath, Buffer.from(grammar));

    await tar.x({
        file: grammarPath,
        cwd: TEMPORARY_DIRECTORY
    });

    const shellSessionGrammarPath = path.join(TEMPORARY_DIRECTORY, "linguist-grammars", "text.shell-session.json");
    const shellSessionGrammar = await fs.readFileSync(shellSessionGrammarPath, "utf-8");

    return {
        grammar: JSON.parse(shellSessionGrammar),
        version: latestVersion
    };
};

const main = async () => {
    const shell = await fetchShellGrammar();
    const shellGrammar = shell.grammar;
    const shellSession = await fetchShellSessionGrammar();
    const shellSessionGrammar = shellSession.grammar;

    console.log("Merging grammars...");

    // Replace ``possible_pre_command_characters`` in https://github.com/jeff-hykin/better-shell-syntax/blob/ea0623cd60ea547227158eecc03e4e4911b33c0d/main/main.rb#L356
    // For more information, see [this issue](https://github.com/jeff-hykin/better-shell-syntax/issues/79#issuecomment-1988590707)
    shellGrammar.repository.normal_statement.begin = shellGrammar.repository.normal_statement.begin.replace(
        "(?:^|;|\\||&|!|\\(|\\{|\\`)",
        "(?:^|;|\\||&|!|\\(|\\{|\\`|\\$)"
    );

    shellSessionGrammar.name = "shellsession";
    shellSessionGrammar.patterns[0].match = shellSessionGrammar.patterns[0].match.replace("\\s+ (.*) $", "(.*) $");
    shellSessionGrammar.patterns[0].captures["3"].name = "source.shell";
    shellSessionGrammar.patterns[0].captures["3"].patterns[0].include = "#shell";

    const grammar = {
        information_for_contributors: [
            "This file is autogenerated. Do not edit it manually. Instead, edit the `generate.ts` script and run it.",
            "Sources for this file are:",
            SHELL_GRAMMAR_REPOSITORY_URL,
            LINGUIST_REPOSITORY_URL
        ],
        lastUpdated: new Date().toISOString(),
        shellGrammarVersion: shell.version,
        shellSessionGrammarVersion: shellSession.version,
        ...shellSessionGrammar,
        repository: {
            shell: {
                include: "#initial_context"
            },
            ...shellGrammar.repository
        }
    };

    const outputPath = path.join(OUTPUT_DIRECTORY, "shell-session.tmLanguage.json");
    await fs.writeFileSync(outputPath, JSON.stringify(grammar, null, 4));

    console.log("Done!");
};

main();
