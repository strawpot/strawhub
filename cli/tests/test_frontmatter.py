"""Tests for frontmatter.py — ported from convex/lib/frontmatter.test.ts."""

from strawhub.frontmatter import parse_frontmatter, extract_dependencies


class TestParseFrontmatter:
    def test_basic_key_value(self):
        text = '---\nname: my-skill\ndescription: "A cool skill"\n---\nBody content here.\n'
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "my-skill"
        assert result["frontmatter"]["description"] == "A cool skill"
        assert result["body"] == "Body content here.\n"

    def test_no_delimiters(self):
        text = "Just plain markdown."
        result = parse_frontmatter(text)
        assert result["frontmatter"] == {}
        assert result["body"] == "Just plain markdown."

    def test_yaml_list(self):
        text = '---\nname: code-review\ntags:\n  - security-baseline\n  - git-workflow\n---\nBody.\n'
        result = parse_frontmatter(text)
        assert result["frontmatter"]["tags"] == [
            "security-baseline",
            "git-workflow",
        ]

    def test_inline_array(self):
        text = "---\ntags: [testing, ci, quality]\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["tags"] == ["testing", "ci", "quality"]

    def test_inline_array_quoted(self):
        text = "---\ntags: [\"testing\", 'ci']\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["tags"] == ["testing", "ci"]

    def test_boolean_values(self):
        text = "---\nenabled: true\ndisabled: false\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["enabled"] is True
        assert result["frontmatter"]["disabled"] is False

    def test_numeric_values(self):
        text = "---\ncount: 42\nratio: 3.14\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["count"] == 42
        assert result["frontmatter"]["ratio"] == 3.14

    def test_single_quoted_strings(self):
        text = "---\nname: 'my-skill'\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "my-skill"

    def test_unquoted_string(self):
        text = "---\nname: my-skill\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "my-skill"

    def test_empty_body(self):
        text = "---\nname: test\n---\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "test"
        assert result["body"] == ""

    def test_multiple_yaml_lists(self):
        text = "---\ntopics:\n  - skill-a\n  - skill-b\ntags:\n  - foo\n  - bar\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["topics"] == ["skill-a", "skill-b"]
        assert result["frontmatter"]["tags"] == ["foo", "bar"]

    def test_mixed_scalar_and_list(self):
        text = '---\nname: implementer\ndescription: "One-line summary"\ntags:\n  - git-workflow\n  - code-review\n---\nInstructions here.\n'
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "implementer"
        assert result["frontmatter"]["description"] == "One-line summary"
        assert result["frontmatter"]["tags"] == [
            "git-workflow",
            "code-review",
        ]
        assert result["body"] == "Instructions here.\n"

    def test_nested_object_with_sub_key_arrays(self):
        text = "---\nname: implementer\nconfig:\n  skills:\n    - git-workflow\n    - code-review>=1.0.0\n  roles:\n    - reviewer\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "implementer"
        assert result["frontmatter"]["config"] == {
            "skills": ["git-workflow", "code-review>=1.0.0"],
            "roles": ["reviewer"],
        }

    def test_nested_object_single_sub_key(self):
        text = "---\nconfig:\n  skills:\n    - git-workflow\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["config"] == {
            "skills": ["git-workflow"],
        }

    def test_deeply_nested_metadata_strawpot_dependencies(self):
        text = (
            "---\n"
            "name: implementer\n"
            "metadata:\n"
            "  strawpot:\n"
            "    dependencies:\n"
            "      skills:\n"
            "        - git-workflow\n"
            "        - code-review\n"
            "      roles:\n"
            "        - reviewer\n"
            "---\n"
            "Body.\n"
        )
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "implementer"
        assert result["frontmatter"]["metadata"] == {
            "strawpot": {
                "dependencies": {
                    "skills": ["git-workflow", "code-review"],
                    "roles": ["reviewer"],
                },
            },
        }

    def test_skill_deps_under_metadata_strawpot_as_flat_array(self):
        text = (
            "---\n"
            "name: code-review\n"
            "metadata:\n"
            "  strawpot:\n"
            "    dependencies:\n"
            "      - security-baseline\n"
            "      - git-workflow>=1.0.0\n"
            "---\n"
            "Body.\n"
        )
        result = parse_frontmatter(text)
        assert result["frontmatter"]["metadata"] == {
            "strawpot": {
                "dependencies": ["security-baseline", "git-workflow>=1.0.0"],
            },
        }

    def test_deep_nesting_with_scalar_values(self):
        text = (
            "---\n"
            "name: implementer\n"
            "metadata:\n"
            "  strawpot:\n"
            "    default_model:\n"
            "      provider: claude_session\n"
            "---\n"
            "Body.\n"
        )
        result = parse_frontmatter(text)
        assert result["frontmatter"]["metadata"] == {
            "strawpot": {
                "default_model": {
                    "provider": "claude_session",
                },
            },
        }

    def test_nested_object_followed_by_top_level_key(self):
        text = (
            "---\n"
            "name: implementer\n"
            "metadata:\n"
            "  strawpot:\n"
            "    dependencies:\n"
            "      skills:\n"
            "        - git-workflow\n"
            "        - code-review\n"
            "      roles:\n"
            "        - reviewer\n"
            "tags:\n"
            "  - coding\n"
            "---\n"
            "Body.\n"
        )
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "implementer"
        assert result["frontmatter"]["metadata"] == {
            "strawpot": {
                "dependencies": {
                    "skills": ["git-workflow", "code-review"],
                    "roles": ["reviewer"],
                },
            },
        }
        assert result["frontmatter"]["tags"] == ["coding"]

    def test_blank_lines_in_frontmatter(self):
        text = '---\nname: test\n\ndescription: "hello"\n---\nBody.\n'
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "test"
        assert result["frontmatter"]["description"] == "hello"


class TestExtractDependencies:
    def test_extract_skill_deps_flat_array(self):
        fm = {
            "metadata": {
                "strawpot": {
                    "dependencies": ["security-baseline", "git-workflow>=1.0.0"],
                },
            },
        }
        result = extract_dependencies(fm, "skill")
        assert result == {"skills": ["security-baseline", "git-workflow>=1.0.0"]}

    def test_extract_role_deps_nested_object(self):
        fm = {
            "metadata": {
                "strawpot": {
                    "dependencies": {
                        "skills": ["git-workflow"],
                        "roles": ["reviewer"],
                    },
                },
            },
        }
        result = extract_dependencies(fm, "role")
        assert result == {"skills": ["git-workflow"], "roles": ["reviewer"]}

    def test_returns_none_when_no_metadata(self):
        fm = {"name": "test"}
        assert extract_dependencies(fm, "skill") is None

    def test_returns_none_when_no_strawpot(self):
        fm = {"metadata": {"other": {}}}
        assert extract_dependencies(fm, "skill") is None

    def test_returns_none_when_no_dependencies(self):
        fm = {"metadata": {"strawpot": {"other": "value"}}}
        assert extract_dependencies(fm, "skill") is None
