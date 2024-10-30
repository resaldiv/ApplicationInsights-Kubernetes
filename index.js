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

        const repo_token = core.getInput('repo-token');
        const comment = core.getInput('comment', { required: false });
        
        if (comment) {
            const pr_body = core.getInput('pr-body');
            const comment_id = core.getInput('comment-id');
            console.log(comment_id);
            const pr_number = core.getInput('pr-number');
            const repo = core.getInput('repo');
            const repo_url = `https://github.com/${repo}`;
            const session_id = pr_body.split('Session ID: ')[1].split('.')[0];

            const query = comment.split('/devbot ')[1];
            const response = await get_response(auth_token, session_id, query);
            post_comment(repo_token, repo_url, pr_number, response);
        } else {
            console.log("---Issue info---");
            const issue_body = core.getInput('issue-body');
            const issue_title = core.getInput('issue-title');
            const issue_number = core.getInput('issue-number');

            console.log("---Symbol info---");
            const parent_symbol = issue_body.split('<!-- ps: ')[1].split(' -->')[0];
            const child_symbol = issue_body.split('<!-- s: ')[1].split(' -->')[0];
            const parent_class_name = parent_symbol.split('!')[0].split('.').at(-1);
            const parent_method_name = parent_symbol.split('!')[1];
            const child_method_name = child_symbol.split('!')[1];

            console.log("---Files---");
            const path_ending = `${parent_class_name}.cs`;
            const found_files = searchFiles('./', path_ending);
            console.log(`Found files for ${path_ending}: ${found_files.join('\n')}`);

            console.log("---Localization---");
            const localization = await getLocalizationValues(found_files, parent_class_name, parent_method_name, child_method_name);
            const buggy_file_path = localization[0];
            const buggy_method_name = localization[1];
            const buggy_range = localization[2];
            const buggy_file_data = localization[3];
            console.log(`Buggy file path: ${buggy_file_path}`);
            console.log(`Buggy method name: ${buggy_method_name}`);
            console.log(`Buggy range: ${buggy_range}`);
            console.log(`Buggy file data:\n${buggy_file_data}`);

            const start_line_number = parseInt(buggy_range[0]);
            const end_line_number = parseInt(buggy_range[1]);
            const deepprompt_response = await get_deepprompt_response(auth_token, session_id, buggy_file_data, start_line_number, buggy_method_name);
            // create_pr(repo_token, repo_url, buggy_file_path, issue_title, issue_number, file, fixed_file, session_id);
        }
    } catch (error) {
        core.setFailed(error.message);
    }
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

async function get_deepprompt_response(auth_token, session_id, buggy_file_data, start_line_number, buggy_method_name)
{
    const intent = 'perf_fix';
    const prompt_strategy = 'instructive';
    try {
        const response = await fetch(`${DEEPPROMPT_ENDPOINT}/query`, {
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
                    'source_code': buggy_file_data,
                    'buggy_function_call': buggy_method_name,
                    'start_line_number': start_line_number.toString(),
                    'prompt_strategy': prompt_strategy
                }
            })
        });
        const response_json = await response.json();
        console.log("Response:");
        console.log(response_json);

        const response_text = response_json["response_text"];
        console.log("Response text:");
        console.log(response_text);
        return response_text;
    } catch (error) {
        console.log("Error in trying DeepPrompt call");
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

function find_end_of_function(data, start_line_number) {
    var lines = data.split('\n');
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

async function getLocalizationValues(found_files, parent_class_name, parent_method_name, child_method_name) {
    for (let i = 0; i < found_files.length; i++) {
        const file = found_files[i];
        const file_data = fs.readFileSync(file, 'utf8');
        const buggy_range = getBuggyRange(
            file_data,
            parent_class_name,
            parent_method_name,
            child_method_name
        );
        if (buggy_range.length > 0) {
            return [file.toString(), child_method_name, buggy_range, file_data];
        }
    }

    for (let i = 0; i < found_files.length; i++) {
        const file = found_files[i];
        const file_data = fs.readFileSync(file, 'utf8');
        const buggy_range = getBuggyRange(
            file_data,
            parent_class_name,
            parent_method_name,
            child_method_name,
            true
        );
        if (buggy_range.length > 0) {
            return [file.toString(), "", buggy_range, file_data];
        }
    }

    return ["", "", [], ""];
}

function getBuggyRange(file_data, parent_class_name, parent_method_name, child_method_name, ignore_bottleneck = false) {
    const parent_function_signature = parent_method_name !== "ctor" ? `${parent_method_name}(` : `${parent_class_name}(`;
    const child_function_signature = `${child_method_name}(`;
    
    const possible_starts = findAllOccurrences(file_data, parent_function_signature);
    for (let i = 0; i < possible_starts.length; i++) {
        const start = possible_starts[i];
        const end = getBalancedEndIndex(file_data.substring(start));

        const file_data_block = file_data.substring(start, start + end);
        if (file_data_block.includes(child_function_signature)) {
            const bug_starts = findAllOccurrences(file_data_block, child_function_signature);
            if (bug_starts.length > 0) {
                const start_line_number = file_data.substring(0, start).split("\n").length;
                const end_line_number = file_data.substring(0, start + end).split("\n").length;
                return [start_line_number - 1, end_line_number - 1];
            }
        }

        if (ignore_bottleneck) {
            const start_line_number = file_data.substring(0, start).split("\n").length;
            const end_line_number = file_data.substring(0, start + end).split("\n").length;
            return [start_line_number - 1, end_line_number - 1];
        }
    }

    return [];
}

function findAllOccurrences(data, function_signature) {
    let result = [];
    let position = data.indexOf(function_signature);
    while (position !== -1) {
        result.push(position);
        position = data.indexOf(function_signature, position + 1);
    }
    return result;
}

function getBalancedEndIndex(data) {
  let open_count = 0;
  let index = 0;
  while (index < data.length) {
    const ch = data[index];
    if (ch === "{") {
      open_count += 1;
    } else if (ch === "}") {
      open_count -= 1;
      if (open_count === 0) {
        return index;
      }
    }
    index += 1;
  }
  return 0;
}

run();
