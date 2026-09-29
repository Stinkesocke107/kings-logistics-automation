from pathlib import Path


def add_api_health_step(path_name: str, anchor: str, indent='      '):
    path = Path(path_name)
    source = path.read_text(encoding='utf-8')
    if 'name: Save API Health State' in source:
        return

    step = '''
      - name: Save API Health State
        if: always()
        run: |
          if [ ! -d data/api-health ] || [ -z "$(git status --porcelain -- data/api-health)" ]; then
            echo "No API health state changes to save."
            exit 0
          fi

          git config user.name "Kings Logistics Automation"
          git config user.email "actions@users.noreply.github.com"
          git add data/api-health

          if git diff --cached --quiet; then
            echo "No API health changes staged."
            exit 0
          fi

          git commit -m "Update Kings API health state"
          git pull --rebase origin main
          git push origin main
'''
    if anchor not in source:
        raise SystemExit(f'Anchor not found in {path_name}: {anchor!r}')
    source = source.replace(anchor, anchor + step, 1)
    path.write_text(source, encoding='utf-8')


# Driver guard persistence + API health.
path = Path('.github/workflows/driver-updates.yml')
source = path.read_text(encoding='utf-8')
old = '''      - name: Save Driver Data
        run: |
          if git diff --quiet -- \\
            data/driver-members.json \\
            data/driver-history.json \\
            && [ -z "$(git status --porcelain \\
              data/driver-members.json \\
              data/driver-history.json)" ]; then

            echo "No Driver data changes to save."
            exit 0
          fi

          git config user.name "Kings Logistics Automation"
          git config user.email "actions@users.noreply.github.com"

          git add data/driver-members.json
          git add data/driver-history.json

          git commit -m "Update Kings Driver data"

          git pull --rebase origin main
          git push origin main
'''
new = '''      - name: Save Driver Data
        run: |
          if [ -z "$(git status --porcelain -- \\
            data/driver-members.json \\
            data/driver-history.json \\
            data/driver-change-guard.json)" ]; then

            echo "No Driver data or change-guard changes to save."
            exit 0
          fi

          git config user.name "Kings Logistics Automation"
          git config user.email "actions@users.noreply.github.com"

          git add data/driver-members.json
          git add data/driver-history.json

          if [ -n "$(git status --porcelain -- data/driver-change-guard.json)" ]; then
            git add -A -- data/driver-change-guard.json
          fi

          git commit -m "Update Kings Driver data"

          git pull --rebase origin main
          git push origin main
'''
if old not in source:
    raise SystemExit('Driver Save Driver Data block not found')
source = source.replace(old, new, 1)
path.write_text(source, encoding='utf-8')
add_api_health_step('.github/workflows/driver-updates.yml', new)


# Staff API health.
path = Path('.github/workflows/staff-management.yml')
source = path.read_text(encoding='utf-8')
anchor = '''          git pull --rebase origin main
          git push origin main
'''
if anchor not in source:
    raise SystemExit('Staff save anchor not found')
# Insert after the final existing save block.
if 'name: Save API Health State' not in source:
    source += '''
      - name: Save API Health State
        if: always()
        run: |
          if [ ! -d data/api-health ] || [ -z "$(git status --porcelain -- data/api-health)" ]; then
            echo "No API health state changes to save."
            exit 0
          fi
          git config user.name "Kings Logistics Automation"
          git config user.email "actions@users.noreply.github.com"
          git add data/api-health
          if git diff --cached --quiet; then exit 0; fi
          git commit -m "Update Kings API health state"
          git pull --rebase origin main
          git push origin main
'''
path.write_text(source, encoding='utf-8')


# News API health.
path = Path('.github/workflows/news.yml')
source = path.read_text(encoding='utf-8')
if 'name: Save API Health State' not in source:
    source += '''
      - name: Save API Health State
        if: always()
        run: |
          if [ ! -d data/api-health ] || [ -z "$(git status --porcelain -- data/api-health)" ]; then
            echo "No API health state changes to save."
            exit 0
          fi
          git config user.name "Kings Logistics Automation"
          git config user.email "actions@users.noreply.github.com"
          git add data/api-health
          if git diff --cached --quiet; then exit 0; fi
          git commit -m "Update Kings API health state"
          git pull --rebase origin main
          git push origin main
'''
path.write_text(source, encoding='utf-8')


# Live Tracker API health.
path = Path('.github/workflows/live-tracker.yml')
source = path.read_text(encoding='utf-8')
if 'name: Save API Health State' not in source:
    source += '''
      - name: Save API Health State
        if: always()
        run: |
          if [ ! -d data/api-health ] || [ -z "$(git status --porcelain -- data/api-health)" ]; then
            echo "No API health state changes to save."
            exit 0
          fi
          git config user.name "Kings Logistics Automation"
          git config user.email "actions@users.noreply.github.com"
          git add data/api-health
          if git diff --cached --quiet; then exit 0; fi
          git commit -m "Update Kings API health state"
          git pull --rebase origin main
          git push origin main
'''
path.write_text(source, encoding='utf-8')


# Convoy workflow needs write permission only for technical API health state.
path = Path('.github/workflows/convoy-checker.yml')
source = path.read_text(encoding='utf-8')
source = source.replace('permissions:\n  contents: read\n', 'permissions:\n  contents: write\n', 1)
if 'name: Save API Health State' not in source:
    source += '''
      - name: Save API Health State
        if: always()
        run: |
          if [ ! -d data/api-health ] || [ -z "$(git status --porcelain -- data/api-health)" ]; then
            echo "No API health state changes to save."
            exit 0
          fi
          git config user.name "Kings Logistics Automation"
          git config user.email "actions@users.noreply.github.com"
          git add data/api-health
          if git diff --cached --quiet; then exit 0; fi
          git commit -m "Update Kings API health state"
          git pull --rebase origin main
          git push origin main
'''
path.write_text(source, encoding='utf-8')

print('API health persistence added to Driver, Staff, News, Live Tracker, and Convoy workflows.')
