const core = require('@actions/core');
const github = require('@actions/github');
const fetch = require('node-fetch');
var base64 = require('js-base64').Base64;
const { Octokit } = require('@octokit/core');
const { createPullRequest } = require('octokit-plugin-create-pull-request');
const MyOctokit = Octokit.plugin(createPullRequest);
const fs = require('fs');
const path = require('path');

DEEPPROMPT_ENDPOINT = "https://data-ai.microsoft.com/deepprompt/api/v1"

async function run() {
    try {
        console.log("---DeepPrompt Auth---");
        const pat_token = core.getInput('pat-token');
        const auth = await get_deepprompt_auth(pat_token);
        const auth_token = auth['access_token'];
        const session_id = auth['session_id'];

        console.log("---Issue info---");
        const issue_title = core.getInput('issue-title');
        const issue_body = core.getInput('issue-body');
        const issue_number = core.getInput('issue-number');
        console.log(issue_body);

        console.log("---Symbol info---");
        const parent_symbol = issue_body.split('<!-- ps: ')[1].split(' -->')[0];
        const child_symbol = issue_body.split('<!-- s: ')[1].split(' -->')[0];
        const parent_class_name = parent_symbol.split('!')[0].split('.').at(-1);
        const parent_method_name = parent_symbol.split('!')[1];
        const child_method_name = child_symbol.split('!')[1];
        console.log(parent_symbol.split('!')[0].split('.'));

        console.log("---Files---");
        const path_ending = `${parent_class_name}.cs`;
        const found_files = searchFiles('./', path_ending);
        console.log(`Found files for ${path_ending}: ${found_files.join('\n')}`);

        console.log("---Fixed file---");
        const file = `// ---------------------------------------------------------------------------\n// <copyright file="Scrubber.cs" company="Microsoft">\n//     Copyright (c) Microsoft Corporation.  All rights reserved.\n// </copyright>\n// ---------------------------------------------------------------------------\n\nnamespace Microsoft.ApplicationInsights.Kubernetes\n{\n    using System;\n    using System.Collections.Generic;\n    using System.Linq;\n    using System.Text.RegularExpressions;\n\n    public class Scrubber\n    {\n        public const string EmailRegExPattern = @"[a-zA-Z0-9!#$+\-^_~]+(?:\.[a-zA-Z0-9!#$+\-^_~]+)*@(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,6}";\n        public static string ScrubData(string data, char replacementChar)\n        {\n            Regex rx = new Regex(EmailRegExPattern);\n            foreach (Match match in rx.Matches(data))\n            {\n                string replacementString = new string(replacementChar, match.Value.Length);\n                data = data.Replace(match.Value, replacementString);\n            }\n\n            return data;\n        }\n    }\n}`;
        const start_line_number = 17;
        const bottleneck_call = "Replace";
        try {
            console.log("--- TRY Fixed file---");
            const fixed_file = await fix_bug(auth_token, session_id, file, start_line_number, bottleneck_call);
            console.log(fixed_file);
        } catch (error) {
            console.log("Fixed file error");
            core.setFailed(error.message);
        }
    } catch (error) {
        console.log("Run error");
        core.setFailed(error.message);
    }

    // try {
    //     const repo_token = core.getInput('repo-token');
    //     const pat_token = core.getInput('pat-token');
    //     const comment = core.getInput('comment', { required: false });

    //     // var auth = await get_deepprompt_auth(pat_token);
    //     // var auth_token = auth['access_token'];
    //     // var session_id = auth['session_id'];

    //     if (comment) {
    //         const pr_body = core.getInput('pr-body');
    //         const comment_id = core.getInput('comment-id');
    //         console.log(comment_id);
    //         const pr_number = core.getInput('pr-number');
    //         const repo = core.getInput('repo');
    //         const repo_url = `https://github.com/${repo}`;
    //         const session_id = pr_body.split('Session ID: ')[1].split('.')[0];

    //         const query = comment.split('/devbot ')[1];
    //         const response = await get_response(auth_token, session_id, query);
    //         post_comment(repo_token, repo_url, pr_number, response);
    //     } else {
    //         const issue_title = core.getInput('issue-title');
    //         const issue_body = core.getInput('issue-body');
    //         const issue_number = core.getInput('issue-number');
    //         const parent_symbol = issue_body.split('<!-- ps: ')[1].split(' -->')[0];
    //         const child_symbol = issue_body.split('<!-- s: ')[1].split(' -->')[0];

    //         const parent_class_name = parent_symbol.split('!')[0].split('.').at(-1);
    //         const parent_method_name = parent_symbol.split('!')[1];
    //         const child_method_name = child_symbol.split('!')[1];
    //         console.log(parent_symbol.split('!')[0].split('.'));
            
    //         const path_ending = `${parent_class_name}.cs`;
    //         const found_files = searchFiles('./', path_ending);
    //         console.log(`Found files for ${path_ending}: ${found_files.join('\n')}`);

    //         const issue_metadata = JSON.parse(issue_body);
    //         const buggy_file_path = issue_metadata['buggy_file_path'];
    //         const repo_url = issue_metadata['repo_url'];
    //         var file = await get_file(repo_token, repo_url, buggy_file_path);

    //         var fixed_file = await fix_bug(auth_token, session_id, file, issue_metadata['start_line_number'], issue_metadata['bottleneck_call']);
            
    //         console.log(fixed_file);
            
    //         create_pr(repo_token, repo_url, buggy_file_path, issue_title, issue_number, file, fixed_file, session_id);
    //     }
    // } catch (error) {
    //     core.setFailed(error.message);
    // }
}

function searchFiles(dir, fileExtension, files = [])
{
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries)
    {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory())
        {
            searchFiles(fullPath, fileExtension, files);
        } else if (entry.isFile() && fullPath.endsWith(fileExtension))
        {
            files.push(fullPath);
        }
    }
    return files;
}


async function post_comment(access_token, repo_url, pr_number, comment)
{
    var owner = repo_url.split('/')[3];
    var repo_name = repo_url.split('/')[4];
    var url = `https://api.github.com/repos/${owner}/${repo_name}/issues/${pr_number}/comments`;
    let response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${access_token}`
        }, 
        body: JSON.stringify({
            'body': comment
        })
    });
    let data = await response.json();
    console.log(data);
}

async function get_response(auth_token, session_id, query)
{
    let response = await fetch(`${DEEPPROMPT_ENDPOINT}/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'DeepPrompt-Version': 'v1',
            'Accept': 'application/json',
            'Authorization': `Bearer ${auth_token}`,
            'DeepPrompt-Session-ID': session_id
        },
        body: JSON.stringify({
            'query': query,
        })
    });
    let data = await response.json();
    let response_text = data['response_text'];
    console.log("---------------");
    console.log(data);
    return response_text;
}

async function fix_bug(auth_token, session_id, buggy_code, start_line_number, buggy_function_call)
{
    var intent = 'perf_fix';
    try {
            let response = await fetch(`${DEEPPROMPT_ENDPOINT}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'DeepPrompt-Version': 'v1',
                'Accept': 'application/json',
                'Authorization': `Bearer ${auth_token}`,
                'DeepPrompt-Session-ID': session_id
            },
            body: JSON.stringify({
                'query': 'Can you fix the above perf issue?',
                'intent': intent,
                'context': {
                    'source_code': buggy_code,
                    'buggy_function_call': buggy_function_call,
                    'start_line_number': start_line_number.toString(),
                    'prompt_strategy': 'instructive'
                }
            })
        });
        let data = await response.json();
        console.log("RESPONSE:");
        console.log(data);

        const response_text = data["response_text"];
        console.log("RESPONSE text:");
        console.log(response_text);

        const code_text_array = response_text.match(/```([^`]*)```/);
        const code_text = code_text_array[1];
        const code_to_remove = `csharp\n\n`;
        const clean_code_text = code_text.substring(code_text.indexOf(code_to_remove) + code_to_remove.length);
        return `\`\`\`csharp
${clean_code_text}
\`\`\``;
    } catch (error) {
        console.log("Error in Trying DeepPrompt call");
        core.setFailed(error.message);
    }
}

async function get_deepprompt_auth(pat_token) {
    try {
        const response = await fetch(`${DEEPPROMPT_ENDPOINT}/exchange`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                'token': pat_token,
                'provider': 'github'
            })
        });
        const auth_token = await response.json();
        if (auth_token["error"]) {
            console.log("DeepPrompt Auth response error");
            core.setFailed(auth_token["error"].message);
        }
        return auth_token;
    }
    catch (error) {
        console.log("DeepPrompt Auth catch error");
        core.setFailed(error.message);
    }
}

async function get_file(access_token, repo_url, buggy_file_path) {
    const user = repo_url.split('/')[3];
    const repo = repo_url.split('/')[4];
    try {
        url = `https://api.github.com/repos/${user}/${repo}/contents/${buggy_file_path}`
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `token ${access_token}`
            }
        });
        let data = await response.json();
        let file = base64.decode(data.content);
        return file;
    }
    catch (error) {
        core.setFailed(error.message);
    }
}

function find_end_of_function(code, start_line_number) {
    var lines = code.split('\n');
    var i = start_line_number;
    var open_braces = 0;
    while (i < lines.length) {
        var line = lines[i];
        for (var j = 0; j < line.length; j++) {
            if (line[j] == '{') {
                open_braces++;
            }
            else if (line[j] == '}') {
                open_braces--;
            }
        }
        if (open_braces == 0) {
            return i;
        }
        i++;
    }
    return i;
}

async function create_pr(access_token, repo_url, buggy_file_path, issue_title, issue_number, file, fixed_file, session_id) {
    const user = repo_url.split('/')[3];
    const repo = repo_url.split('/')[4];
    const fix_title = `PERF: Fix ${issue_title}`;
    const branch_name = 'test-branch-' + (new Date()).getTime();

    const octokit = new MyOctokit({
        auth: access_token,
    });

    var change = {}
    change[buggy_file_path] = fixed_file;
    octokit.createPullRequest({
        owner: user,
        repo: repo,
        title: fix_title,
        body: `Auto-generated PR fixing issue #${issue_number}. Session ID: ${session_id}.`,
        head: branch_name,
        base: 'main',
        update: false,
        forceFork: false,
        changes: [
            {
                files: change,
                commit: fix_title,
            },
        ],
    });
}

run();
