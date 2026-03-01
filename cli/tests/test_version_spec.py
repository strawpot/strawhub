"""Tests for version_spec.py — ported from convex/lib/versionSpec.test.ts."""

import pytest

from strawhub.version_spec import (
    DependencySpec,
    ParsedVersion,
    compare_versions,
    extract_slug,
    parse_constraint,
    parse_dependency_spec,
    parse_dir_name,
    parse_version,
    satisfies_version,
)


# --- parseDependencySpec ---


class TestParseDependencySpec:
    def test_bare_slug(self):
        assert parse_dependency_spec("git-workflow") == DependencySpec(
            "git-workflow", "latest", None
        )

    def test_exact_version(self):
        assert parse_dependency_spec("code-review==1.0.0") == DependencySpec(
            "code-review", "==", "1.0.0"
        )

    def test_minimum_version(self):
        assert parse_dependency_spec("testing>=2.1.0") == DependencySpec(
            "testing", ">=", "2.1.0"
        )

    def test_caret_version(self):
        assert parse_dependency_spec("utils^1.2.3") == DependencySpec(
            "utils", "^", "1.2.3"
        )

    def test_trims_whitespace(self):
        assert parse_dependency_spec("  git-workflow>=1.0.0  ") == DependencySpec(
            "git-workflow", ">=", "1.0.0"
        )

    def test_single_char_slug(self):
        assert parse_dependency_spec("x") == DependencySpec("x", "latest", None)

    def test_invalid_spec(self):
        with pytest.raises(ValueError, match="Invalid dependency specifier"):
            parse_dependency_spec("!!!invalid")

    def test_empty_string(self):
        with pytest.raises(ValueError, match="Invalid dependency specifier"):
            parse_dependency_spec("")


# --- parseVersion ---


class TestParseVersion:
    def test_valid_version(self):
        assert parse_version("1.2.3") == ParsedVersion(1, 2, 3)

    def test_zeros(self):
        assert parse_version("0.0.0") == ParsedVersion(0, 0, 0)

    def test_invalid_version_partial(self):
        with pytest.raises(ValueError, match="Invalid version"):
            parse_version("1.2")

    def test_invalid_version_text(self):
        with pytest.raises(ValueError, match="Invalid version"):
            parse_version("abc")


# --- compareVersions ---


class TestCompareVersions:
    def test_equal(self):
        assert compare_versions(ParsedVersion(1, 2, 3), ParsedVersion(1, 2, 3)) == 0

    def test_major_difference(self):
        assert compare_versions(ParsedVersion(2, 0, 0), ParsedVersion(1, 9, 9)) == 1
        assert compare_versions(ParsedVersion(1, 0, 0), ParsedVersion(2, 0, 0)) == -1

    def test_minor_difference(self):
        assert compare_versions(ParsedVersion(1, 3, 0), ParsedVersion(1, 2, 0)) == 1
        assert compare_versions(ParsedVersion(1, 2, 0), ParsedVersion(1, 3, 0)) == -1

    def test_patch_difference(self):
        assert compare_versions(ParsedVersion(1, 2, 4), ParsedVersion(1, 2, 3)) == 1
        assert compare_versions(ParsedVersion(1, 2, 3), ParsedVersion(1, 2, 4)) == -1


# --- satisfiesVersion ---


class TestSatisfiesVersion:
    def test_latest_always_satisfies(self):
        spec = DependencySpec("x", "latest", None)
        assert satisfies_version("0.0.1", spec) is True
        assert satisfies_version("99.99.99", spec) is True

    def test_exact_match(self):
        spec = DependencySpec("x", "==", "1.2.3")
        assert satisfies_version("1.2.3", spec) is True
        assert satisfies_version("1.2.4", spec) is False
        assert satisfies_version("1.2.2", spec) is False

    def test_minimum_version(self):
        spec = DependencySpec("x", ">=", "1.2.0")
        assert satisfies_version("1.2.0", spec) is True
        assert satisfies_version("1.3.0", spec) is True
        assert satisfies_version("2.0.0", spec) is True
        assert satisfies_version("1.1.9", spec) is False
        assert satisfies_version("0.9.0", spec) is False

    def test_caret_same_major_and_gte(self):
        spec = DependencySpec("x", "^", "1.2.0")
        assert satisfies_version("1.2.0", spec) is True
        assert satisfies_version("1.9.0", spec) is True
        assert satisfies_version("1.2.1", spec) is True
        assert satisfies_version("2.0.0", spec) is False  # different major
        assert satisfies_version("1.1.0", spec) is False  # below minimum
        assert satisfies_version("0.2.0", spec) is False  # different major


# --- extractSlug ---


class TestExtractSlug:
    def test_bare_slug(self):
        assert extract_slug("git-workflow") == "git-workflow"

    def test_versioned_specs(self):
        assert extract_slug("git-workflow>=1.0.0") == "git-workflow"
        assert extract_slug("code-review==2.1.0") == "code-review"
        assert extract_slug("utils^3.0.0") == "utils"


# --- parseDirName ---


class TestParseDirName:
    def test_simple(self):
        assert parse_dir_name("git-workflow-1.0.0") == ("git-workflow", "1.0.0")

    def test_multi_hyphen_slug(self):
        assert parse_dir_name("my-cool-skill-1.2.3") == ("my-cool-skill", "1.2.3")

    def test_no_version(self):
        assert parse_dir_name("git-workflow") is None

    def test_invalid(self):
        assert parse_dir_name("nope") is None

    def test_numeric_slug(self):
        assert parse_dir_name("s3-utils-0.1.0") == ("s3-utils", "0.1.0")


# --- parseConstraint ---


class TestParseConstraint:
    def test_star_constraint(self):
        assert parse_constraint("*") == DependencySpec("", "latest", None)

    def test_empty_constraint(self):
        assert parse_constraint("") == DependencySpec("", "latest", None)

    def test_caret_constraint(self):
        assert parse_constraint("^1.2.3") == DependencySpec("", "^", "1.2.3")

    def test_exact_constraint(self):
        assert parse_constraint("==1.0.0") == DependencySpec("", "==", "1.0.0")

    def test_gte_constraint(self):
        assert parse_constraint(">=2.0.0") == DependencySpec("", ">=", "2.0.0")

    def test_whitespace_trimmed(self):
        assert parse_constraint("  ^1.0.0  ") == DependencySpec("", "^", "1.0.0")

    def test_invalid_constraint(self):
        with pytest.raises(ValueError, match="Invalid version constraint"):
            parse_constraint("not-valid")

    def test_invalid_no_version(self):
        with pytest.raises(ValueError, match="Invalid version constraint"):
            parse_constraint("^")

    def test_invalid_partial_version(self):
        with pytest.raises(ValueError, match="Invalid version constraint"):
            parse_constraint("==1.0")
