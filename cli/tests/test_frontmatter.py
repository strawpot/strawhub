"""Tests for frontmatter.py — ported from convex/lib/frontmatter.test.ts."""

from strawhub.frontmatter import parse_frontmatter


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

    def test_yaml_list_dependencies(self):
        text = '---\nname: code-review\ndependencies:\n  - security-baseline\n  - git-workflow>=1.0.0\n---\nBody.\n'
        result = parse_frontmatter(text)
        assert result["frontmatter"]["dependencies"] == [
            "security-baseline",
            "git-workflow>=1.0.0",
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
        text = "---\ndependencies:\n  - skill-a\n  - skill-b\ntags:\n  - foo\n  - bar\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["dependencies"] == ["skill-a", "skill-b"]
        assert result["frontmatter"]["tags"] == ["foo", "bar"]

    def test_mixed_scalar_and_list(self):
        text = '---\nname: implementer\ndescription: "One-line summary"\ndependencies:\n  - git-workflow>=1.0.0\n  - code-review\n---\nInstructions here.\n'
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "implementer"
        assert result["frontmatter"]["description"] == "One-line summary"
        assert result["frontmatter"]["dependencies"] == [
            "git-workflow>=1.0.0",
            "code-review",
        ]
        assert result["body"] == "Instructions here.\n"

    def test_nested_object_with_sub_key_arrays(self):
        text = "---\nname: implementer\ndependencies:\n  skills:\n    - git-workflow\n    - code-review>=1.0.0\n  roles:\n    - reviewer\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "implementer"
        assert result["frontmatter"]["dependencies"] == {
            "skills": ["git-workflow", "code-review>=1.0.0"],
            "roles": ["reviewer"],
        }

    def test_nested_object_single_sub_key(self):
        text = "---\ndependencies:\n  skills:\n    - git-workflow\n---\nBody.\n"
        result = parse_frontmatter(text)
        assert result["frontmatter"]["dependencies"] == {
            "skills": ["git-workflow"],
        }

    def test_nested_object_followed_by_top_level_key(self):
        text = (
            "---\n"
            "name: implementer\n"
            "dependencies:\n"
            "  skills:\n"
            "    - git-workflow\n"
            "    - code-review\n"
            "  roles:\n"
            "    - reviewer\n"
            "metadata:\n"
            "  strawpot:\n"
            "    default_model:\n"
            "      provider: claude_session\n"
            "---\n"
            "Body.\n"
        )
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "implementer"
        assert result["frontmatter"]["dependencies"] == {
            "skills": ["git-workflow", "code-review"],
            "roles": ["reviewer"],
        }
        assert "metadata" in result["frontmatter"]

    def test_blank_lines_in_frontmatter(self):
        text = '---\nname: test\n\ndescription: "hello"\n---\nBody.\n'
        result = parse_frontmatter(text)
        assert result["frontmatter"]["name"] == "test"
        assert result["frontmatter"]["description"] == "hello"
