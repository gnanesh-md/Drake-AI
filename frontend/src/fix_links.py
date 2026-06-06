import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # check if there are href="/
    if 'href="/' not in content:
        return

    # Replace <a href="/something" to <Link to="/something"
    new_content = re.sub(r'<a href="(/[^"]*)"', r'<Link to="\1"', content)
    # Replace </a> with </Link> but only if we replaced <a href
    # Since we can't easily track which </a> matches which <a href>, we can just replace all </a> if the file has Links now and had <a href=
    # Wait, simpler: replace `<a href="/something" class="..">Text</a>` -> `<Link to="/something" class="..">Text</Link>`
    
    # A safer approach is to replace:
    # <a href="/...
    # </a>
    # Let's do string replacement for specific patterns
    lines = new_content.split('\n')
    for i, line in enumerate(lines):
        if '<Link to=' in line or '</a>' in line:
            pass # we'll do block replacement
    
    # Just do a naive regex: <a href="(/[a-zA-Z0-9_-]+)"(.*?)>(.*?)</a>
    # It might span multiple lines though.
    pass

def simpler_process(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    if 'href="/' not in content:
        return

    print(f"Processing {filepath}")
    
    # ensure Link is imported
    if 'from "react-router-dom"' not in content and "from 'react-router-dom'" not in content:
        if 'import React' in content or 'import * as React' in content:
            content = content.replace('import React', 'import React\nimport { Link } from "react-router-dom";', 1)
            if 'import { Link }' not in content:
                 content = content.replace('import * as React', 'import * as React\nimport { Link } from "react-router-dom";', 1)
        else:
            content = 'import { Link } from "react-router-dom";\n' + content

    # replace <a href="/..." ...> with <Link to="/..." ...>
    content = re.sub(r'<a (\s*)href="(/[^"]*)"', r'<Link \1to="\2"', content)
    
    # since we changed <a to <Link, we need to change </a> to </Link>
    # this is a bit risky if there are other <a> tags that don't have href="/..."
    # let's just do it manually for the files we found
    pass

