#!/usr/bin/env python3
"""Local, offline regression checks for project generation; no rendering/API calls."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

import create_project as creator


class ProjectGenerationTests(unittest.TestCase):
    def setUp(self):
        self.example = creator.SKILL / 'assets/examples/seahorse.json'
        self.config, self.atlas = creator.validate(self.example)

    def validate_changed(self, config):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'recipe.json'
            config['atlas']['file'] = str(self.atlas)
            path.write_text(json.dumps(config))
            return creator.validate(path)

    def test_two_stage_new_project_uses_selected_cells(self):
        config = copy.deepcopy(self.config)
        config['id'] = 'two-pose-diagnostic'
        config['stages'] = [config['stages'][0], config['stages'][-1]]
        config['duration'] = 6
        config['growth']['end'] = 4.8
        c, atlas = self.validate_changed(config)
        with tempfile.TemporaryDirectory() as tmp:
            out = creator.build(c, atlas, Path(tmp) / 'result')
            saved = json.loads((out / 'config.json').read_text())
            self.assertEqual([s['cell'] for s in saved['stages']], [0, 4])
            self.assertEqual(len(saved['stages']), 2)
            self.assertTrue((out / 'assets/atlas.png').is_file())
            self.assertEqual(creator.png_info(out / 'assets/atlas.png')[:2], (1086, 1448))
            self.assertFalse(any(str(self.example.parent) in p.read_text() for p in [out / 'index.html', out / 'config.json']))

    def test_preserves_existing_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'existing'
            out.mkdir()
            note = out / 'user.txt'
            note.write_text('user work')
            with self.assertRaisesRegex(ValueError, 'never overwritten'):
                creator.build(self.config, self.atlas, out)
            self.assertEqual(note.read_text(), 'user work')
            self.assertEqual(len(list(out.iterdir())), 1)

    def test_rejects_wrong_atlas_dimensions(self):
        c = copy.deepcopy(self.config)
        c['atlas']['cellWidth'] += 1
        with self.assertRaisesRegex(ValueError, 'does not match'):
            self.validate_changed(c)

    def test_rejects_unknown_anatomy_binding(self):
        c = copy.deepcopy(self.config)
        c['annotations'][0]['point'] = 'unmarked-eye'
        with self.assertRaisesRegex(ValueError, 'unknown anatomy'):
            self.validate_changed(c)

    def test_rejects_collapsed_landmarks(self):
        c = copy.deepcopy(self.config)
        c['stages'][0]['points'][1] = c['stages'][0]['points'][0]
        with self.assertRaisesRegex(ValueError, 'coincident'):
            self.validate_changed(c)

    def test_title_remains_data_inside_html(self):
        c = copy.deepcopy(self.config)
        c['title']['zh'] = '</script><script>throw new Error("data executed")</script>'
        with tempfile.TemporaryDirectory() as tmp:
            out = creator.build(c, self.atlas, Path(tmp) / 'result')
            page = (out / 'index.html').read_text()
            self.assertNotIn('</script><script>throw', page)
            saved = json.loads((out / 'config.json').read_text())
            self.assertEqual(saved['title']['zh'], c['title']['zh'])

    def test_rejects_outside_cell_and_invalid_growth(self):
        c = copy.deepcopy(self.config)
        c['stages'][0]['points'][0][0] = 9999
        with self.assertRaisesRegex(ValueError, 'outside'):
            self.validate_changed(c)
        c = copy.deepcopy(self.config)
        c['growth']['end'] = c['duration'] + 1
        with self.assertRaisesRegex(ValueError, 'inside'):
            self.validate_changed(c)


if __name__ == '__main__':
    unittest.main()
