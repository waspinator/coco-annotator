from flask import Blueprint
from flask_restplus import Api

from .annotations import api as ns_annotations
from .categories import api as ns_categories
from .annotator import api as ns_annotator
from .datasets import api as ns_datasets
from .images import api as ns_images
from .undo import api as ns_undo


blueprint = Blueprint('api', __name__, url_prefix='/api')

api = Api(
    blueprint,
    title="Coco Annotator",
    version="0.1",
)

api.namespaces.pop(0)

api.add_namespace(ns_images)
api.add_namespace(ns_annotations)
api.add_namespace(ns_categories)
api.add_namespace(ns_annotator)
api.add_namespace(ns_datasets)
api.add_namespace(ns_undo)

