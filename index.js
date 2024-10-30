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
            const issue_title = core.getInput('issue-title');
            const issue_body = core.getInput('issue-body');
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
            const localization = await findBuggyFile(found_files, parent_class_name, parent_method_name, child_method_name);
            const buggy_file_path = localization[0];
            const start_line_number = parseInt(localization[1][0]) - 1;
            const end_line_number = parseInt(localization[1][1]) - 1;
            const buggy_function_call = localization[2];
            console.log(`Buggy file path: ${buggy_file_path}`);
            console.log(`Start line number: ${start_line_number}`);
            console.log(`End line number: ${end_line_number}`);
            console.log(`Buggy method name: ${buggy_function_call}`);

            // var fixed_file = await fix_bug(auth_token, session_id, file, start_line_number, buggy_function_call);
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

async function findBuggyFile(found_files, parent_class_name, parent_method_name, child_method_name) {
    for (let i = 0; i < found_files.length; i++) {
        let file = found_files[i];
        const data = fs.readFileSync(file, 'utf8');
        let locations = findBugLocationInCode(
            data,
            parent_class_name,
            parent_method_name,
            child_method_name
        );
        if (locations.length > 0) {
            return [file.toString(), locations, child_method_name];
        }
    }

    for (let i = 0; i < files.length; i++) {
        let file = found_files[i];
        let data = fs.readFileSync(file, 'utf8');
        let locations = findBugLocationInCode(
            data,
            parent_class_name,
            parent_method_name,
            child_method_name,
            true
        );
        if (locations.length > 0) {
            return [file.toString(), locations, ""];
        }
    }

    return ["", [], ""];
}

function findBugLocationInCode(data, fileName, parentFunction, bottleneckFunction, ignoreBottleneck = false) {
  let parentFunctionSignature = "";
  if (parentFunction !== "ctor") {
    parentFunctionSignature = `${parentFunction}(`;
  } else {
    parentFunctionSignature = `${fileName}(`;
  }
  const bottleneckFunctionCall = `${bottleneckFunction}(`;

  const possibleStarts = findAllOccurrences(data, parentFunctionSignature);
  for (let i = 0; i < possibleStarts.length; i++) {
    let start = possibleStarts[i];
    let end = getBalancedEndIndex(data.substring(start));
    let block = data.substring(start, start + end);
    if (block.includes(bottleneckFunctionCall)) {
      const bugStarts = findAllOccurrences(block, bottleneckFunctionCall);
      if (bugStarts.length > 0) {
        let blockStartLineNumber = data.substring(0, start).split("\n").length;
        let blockEndLineNumber = data
          .substring(0, start + end)
          .split("\n").length;
        return [blockStartLineNumber, blockEndLineNumber];
      }
    }

    if (ignoreBottleneck) {
      let blockStartLineNumber = data.substring(0, start).split("\n").length;
      let blockEndLineNumber = data.substring(0, start + end).split("\n").length;
      return [blockStartLineNumber, blockEndLineNumber];
    }
  }

  return [];
}

function findAllOccurrences(str, substr) {
    let result = [];
    let idx = str.indexOf(substr);
    while (idx !== -1) {
        result.push(idx);
        idx = str.indexOf(substr, idx + 1);
    }
    return result;
}

function getBalancedEndIndex(data) {
  let openCount = 0;
  let index = 0;
  while (index < data.length) {
    const ch = data[index];
    if (ch === "{") {
      openCount += 1;
    } else if (ch === "}") {
      openCount -= 1;
      if (openCount === 0) {
        return index;
      }
    }
    index += 1;
  }
  return 0;
}


run();
