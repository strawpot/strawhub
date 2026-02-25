---
name: python-testing
description: "Python testing patterns with pytest"
---

# Python Testing

## Framework

Use `pytest` as the test runner. Follow existing project conventions for test
file placement.

## Test Structure

```python
def test_<unit>_<scenario>():
    # Arrange
    ...
    # Act
    ...
    # Assert
    ...
```

## Guidelines

- One assertion per test when practical
- Use fixtures for shared setup
- Prefer `tmp_path` over manual temp directories
- Mock external services and I/O at the boundary
- Name test files `test_<module>.py` matching the source module
- Run the full suite before committing: `pytest`
