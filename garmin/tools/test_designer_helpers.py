"""Shared assertions for canonical content-fitting text geometry."""
import designer_model as model


def assert_fitted_box(test, scene, element):
    test.assertEqual(element['boxSizing'], 'hug')
    operations = [op for op in model.render_text_ops(scene) if op['elementId'] == element['id']]
    bounds = (min(op['x'] for op in operations), min(op['y'] for op in operations),
              max(op['x']+op['width'] for op in operations), max(op['y']+op['height'] for op in operations))
    test.assertEqual(bounds, (element['x'], element['y'],
                              element['x']+element['width'], element['y']+element['height']))
